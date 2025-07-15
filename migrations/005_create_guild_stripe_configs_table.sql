
CREATE TABLE guild_stripe_configs (
  guild_id VARCHAR(255) PRIMARY KEY,
  encrypted_secret_key TEXT NOT NULL,
  encrypted_publishable_key TEXT NOT NULL,
  encrypted_webhook_secret TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_guild_stripe_configs_updated_at
BEFORE UPDATE ON guild_stripe_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
