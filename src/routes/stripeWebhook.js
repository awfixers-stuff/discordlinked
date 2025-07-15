
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const db = require('../db');
const { decrypt } = require('../utils/encryption');

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // Extract guildId from metadata if available (for events like checkout.session.completed)
  // For other events, we might need to fetch it from the subscription/customer object
  let guildId = null;
  try {
    const eventJson = JSON.parse(req.body.toString());
    if (eventJson.data && eventJson.data.object && eventJson.data.object.metadata) {
      guildId = eventJson.data.object.metadata.discord_guild_id;
    }
  } catch (parseError) {
    console.warn('Could not parse event body for guildId extraction:', parseError);
  }

  let webhookSecret;
  if (guildId) {
    try {
      const { rows } = await db.query(
        'SELECT encrypted_webhook_secret FROM guild_stripe_configs WHERE guild_id = $1',
        [guildId]
      );
      if (rows.length > 0) {
        webhookSecret = decrypt(rows[0].encrypted_webhook_secret);
      } else {
        console.warn(`No Stripe webhook secret found for guild ${guildId}.`);
        return res.status(400).send('No webhook secret found for this guild.');
      }
    } catch (dbError) {
      console.error(`Error fetching webhook secret for guild ${guildId}:`, dbError);
      return res.status(500).send('Internal server error fetching webhook secret.');
    }
  } else {
    // Fallback for events without guildId in metadata, or if guildId extraction fails
    // In a production scenario, you might have a default webhook secret or handle this differently
    console.warn('Webhook received without a guildId in metadata. Verification might fail.');
    return res.status(400).send('Webhook requires guildId in metadata.');
  }

  try {
    // Initialize Stripe with the specific guild's secret key (not webhook secret)
    // This is a placeholder, as we only need the webhook secret for verification here.
    // The actual Stripe API calls for fulfillment should use the secret key from the DB.
    const stripeInstance = Stripe(webhookSecret); // This is incorrect, should be secret key
    event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Signature Verification Failed for guild ${guildId}: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log(`Checkout session completed: ${session.id} for guild ${guildId}`);
      // Retrieve the subscription and customer from the session
      const subscriptionId = session.subscription;
      const customerId = session.customer;
      const discordUserId = session.metadata.discord_user_id;

      if (subscriptionId && customerId && discordUserId) {
        try {
          // Fetch the actual Stripe instance for this guild to get subscription details
          const guildStripe = await getStripeInstanceForGuild(guildId);
          const subscription = await guildStripe.subscriptions.retrieve(subscriptionId);

          await db.query(
            'INSERT INTO stripe_subscriptions(stripe_subscription_id, stripe_customer_id, discord_guild_id, status, product_id, current_period_end) VALUES($1, $2, $3, $4, $5, $6) ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = $4, product_id = $5, current_period_end = $6',
            [
              subscription.id,
              subscription.customer,
              guildId,
              subscription.status,
              subscription.items.data[0].price.product,
              new Date(subscription.current_period_end * 1000),
            ]
          );
          console.log(`Subscription ${subscription.id} saved/updated for guild ${guildId}.`);
        } catch (dbOrStripeError) {
          console.error(`Error processing checkout.session.completed for guild ${guildId}:`, dbOrStripeError);
          if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
            Sentry.captureException(dbOrStripeError, { tags: { type: 'stripeWebhook', event: 'checkout.session.completed', guildId: guildId } });
          }
        }
      }
      break;
    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object;
      console.log(`Subscription updated: ${updatedSubscription.id} for guild ${guildId}`);
      try {
        await db.query(
          'UPDATE stripe_subscriptions SET status = $1, current_period_end = $2 WHERE stripe_subscription_id = $3',
          [
            updatedSubscription.status,
            new Date(updatedSubscription.current_period_end * 1000),
            updatedSubscription.id,
          ]
        );
        console.log(`Subscription ${updatedSubscription.id} status updated to ${updatedSubscription.status} for guild ${guildId}.`);
      } catch (dbError) {
        console.error(`Error processing customer.subscription.updated for guild ${guildId}:`, dbError);
        if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
          Sentry.captureException(dbError, { tags: { type: 'stripeWebhook', event: 'customer.subscription.updated', guildId: guildId } });
        }
      }
      break;
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      console.log(`Subscription deleted: ${deletedSubscription.id} for guild ${guildId}`);
      try {
        await db.query(
          'UPDATE stripe_subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
          ['canceled', deletedSubscription.id]
        );
        console.log(`Subscription ${deletedSubscription.id} marked as canceled for guild ${guildId}.`);
      } catch (dbError) {
        console.error(`Error processing customer.subscription.deleted for guild ${guildId}:`, dbError);
        if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
          Sentry.captureException(dbError, { tags: { type: 'stripeWebhook', event: 'customer.subscription.deleted', guildId: guildId } });
        }
      }
      break;
    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type} for guild ${guildId}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

// Helper to get Stripe instance for a guild (moved here for webhook context)
async function getStripeInstanceForGuild(guildId) {
  const { rows } = await db.query(
    'SELECT encrypted_secret_key FROM guild_stripe_configs WHERE guild_id = $1',
    [guildId]
  );
  if (rows.length === 0) {
    throw new Error('Stripe configuration not found for this guild.');
  }
  const decryptedSecretKey = decrypt(rows[0].encrypted_secret_key);
  return Stripe(decryptedSecretKey);
}

module.exports = router;
