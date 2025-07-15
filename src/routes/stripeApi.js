
const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt, decrypt } = require('../utils/encryption');
const Stripe = require('stripe');

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

// Middleware to ensure user has admin access (for setting keys)
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.hasAccess) {
    return next();
  }
  res.status(403).send('Forbidden');
}

// Helper to get Stripe instance for a guild
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

// Set Stripe API keys for a guild
router.post('/config', ensureAdmin, async (req, res) => {
  const { guildId, secretKey, publishableKey, webhookSecret } = req.body;

  if (!guildId || !secretKey || !publishableKey || !webhookSecret) {
    return res.status(400).send('Missing required Stripe configuration fields.');
  }

  try {
    const encryptedSecretKey = encrypt(secretKey);
    const encryptedPublishableKey = encrypt(publishableKey);
    const encryptedWebhookSecret = encrypt(webhookSecret);

    await db.query(
      'INSERT INTO guild_stripe_configs(guild_id, encrypted_secret_key, encrypted_publishable_key, encrypted_webhook_secret) VALUES($1, $2, $3, $4) ON CONFLICT (guild_id) DO UPDATE SET encrypted_secret_key = $2, encrypted_publishable_key = $3, encrypted_webhook_secret = $4',
      [guildId, encryptedSecretKey, encryptedPublishableKey, encryptedWebhookSecret]
    );
    res.status(200).send('Stripe configuration saved successfully.');
  } catch (error) {
    console.error('Error saving Stripe configuration:', error);
    res.status(500).send('Failed to save Stripe configuration.');
  }
});

// Get Stripe Publishable Key for a guild (safe to expose)
router.get('/config/:guildId', ensureAuthenticated, async (req, res) => {
  const { guildId } = req.params;
  try {
    const { rows } = await db.query(
      'SELECT encrypted_publishable_key FROM guild_stripe_configs WHERE guild_id = $1',
      [guildId]
    );
    if (rows.length === 0) {
      return res.status(404).send('Stripe configuration not found for this guild.');
    }
    const decryptedPublishableKey = decrypt(rows[0].encrypted_publishable_key);
    res.json({ publishableKey: decryptedPublishableKey });
  } catch (error) {
    console.error('Error fetching Stripe publishable key:', error);
    res.status(500).send('Failed to fetch Stripe publishable key.');
  }
});

// Create a Stripe Checkout Session
router.post('/create-checkout-session', ensureAuthenticated, async (req, res) => {
  const { priceId, discordGuildId } = req.body;

  if (!discordGuildId) {
    return res.status(400).send('discordGuildId is required.');
  }

  try {
    const stripe = await getStripeInstanceForGuild(discordGuildId);

    // Look up or create a Stripe Customer for the Discord user
    let customerId;
    const { rows: customerRows } = await db.query(
      'SELECT stripe_customer_id FROM stripe_customers WHERE discord_user_id = $1',
      [req.user.id]
    );

    if (customerRows.length > 0) {
      customerId = customerRows[0].stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        metadata: { discord_user_id: req.user.id, discord_username: req.user.username },
      });
      customerId = customer.id;
      await db.query(
        'INSERT INTO stripe_customers(discord_user_id, stripe_customer_id) VALUES($1, $2)',
        [req.user.id, customerId]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?payment=cancelled`,
      metadata: {
        discord_user_id: req.user.id,
        discord_guild_id: discordGuildId,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).send('Failed to create checkout session.');
  }
});

// Get user's subscriptions
router.get('/subscriptions', ensureAuthenticated, async (req, res) => {
  // This endpoint might need to be updated to fetch subscriptions per guild
  // or aggregate from multiple guilds if a user can have subscriptions across them.
  // For now, it fetches all subscriptions linked to the user.
  try {
    const { rows } = await db.query(
      'SELECT * FROM stripe_subscriptions WHERE stripe_customer_id IN (SELECT stripe_customer_id FROM stripe_customers WHERE discord_user_id = $1)',
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).send('Failed to fetch subscriptions.');
  }
});

module.exports = router;
