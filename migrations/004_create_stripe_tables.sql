
CREATE TABLE stripe_customers (
  id SERIAL PRIMARY KEY,
  discord_user_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stripe_subscriptions (
  id SERIAL PRIMARY KEY,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL REFERENCES stripe_customers(stripe_customer_id) ON DELETE CASCADE,
  discord_guild_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  product_id VARCHAR(255),
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add triggers for updated_at columns
CREATE TRIGGER update_stripe_customers_updated_at
BEFORE UPDATE ON stripe_customers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_subscriptions_updated_at
BEFORE UPDATE ON stripe_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
