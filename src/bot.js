require('dotenv').config();
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require("@sentry/profiling-integration");

if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    release: process.env.SENTRY_RELEASE || 'discordlinked@1.0.0',
  });
}

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`Shard ${client.shard.ids[0]} Ready! Logged in as ${client.user.tag}`);
  if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    Sentry.captureMessage(`Shard ${client.shard.ids[0]} Ready`);
  }
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

client.login(process.env.DISCORD_TOKEN);

// Handle IPC messages from the master process
process.on('message', async message => {
  if (message.type === 'presenceUpdate') {
    try {
      client.user.setPresence({
        status: message.data.status,
        activities: [{
          name: message.data.activityName,
          type: message.data.activityType,
        }],
      });
      process.send({ type: 'presenceUpdateSuccess', shardId: client.shard.ids[0] });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to update presence:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'presenceUpdate' } });
      }
      process.send({ type: 'presenceUpdateError', shardId: client.shard.ids[0], error: error.message });
    }
  } else if (message.type === 'fetchGuild') {
    try {
      const guild = await client.guilds.fetch(message.data.guildId);
      process.send({ type: 'fetchGuildSuccess', shardId: client.shard.ids[0], data: guild });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to fetch guild ${message.data.guildId}:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'fetchGuild', guildId: message.data.guildId } });
      }
      process.send({ type: 'fetchGuildError', shardId: client.shard.ids[0], error: error.message });
    }
  } else if (message.type === 'fetchGuilds') {
    try {
      const guilds = await client.guilds.fetch();
      const guildData = guilds.map(g => ({ id: g.id, name: g.name }));
      process.send({ type: 'fetchGuildsSuccess', shardId: client.shard.ids[0], data: guildData });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to fetch guilds:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'fetchGuilds' } });
      }
      process.send({ type: 'fetchGuildsError', shardId: client.shard.ids[0], error: error.message });
    }
  } else if (message.type === 'fetchMembers') {
    try {
      const guild = await client.guilds.fetch(message.data.guildId);
      const members = await guild.members.fetch();
      const memberData = members.map(member => ({
        id: member.id,
        username: member.user.username,
        discriminator: member.user.discriminator,
        tag: member.user.tag,
        roles: member.roles.cache.map(role => ({ id: role.id, name: role.name })),
      }));
      process.send({ type: 'fetchMembersSuccess', shardId: client.shard.ids[0], data: memberData });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to fetch members for guild ${message.data.guildId}:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'fetchMembers', guildId: message.data.guildId } });
      }
      process.send({ type: 'fetchMembersError', shardId: client.shard.ids[0], error: error.message });
    }
  } else if (message.type === 'fetchMember') {
    try {
      const guild = await client.guilds.fetch(message.data.guildId);
      const member = await client.guilds.cache.get(message.data.guildId).members.fetch(message.data.userId);
      process.send({ type: 'fetchMemberSuccess', shardId: client.shard.ids[0], data: member });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to fetch member ${message.data.userId} in guild ${message.data.guildId}:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'fetchMember', guildId: message.data.guildId, userId: message.data.userId } });
      }
      process.send({ type: 'fetchMemberError', shardId: client.shard.ids[0], error: error.message });
    }
  } else if (message.type === 'addRole') {
    try {
      const guild = await client.guilds.fetch(message.data.guildId);
      const member = await client.guilds.cache.get(message.data.guildId).members.fetch(message.data.userId);
      const role = guild.roles.cache.get(message.data.roleId);
      await member.roles.add(role);
      process.send({ type: 'addRoleSuccess', shardId: client.shard.ids[0] });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to add role:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'addRole', guildId: message.data.guildId, userId: message.data.userId, roleId: message.data.roleId } });
      }
      process.send({ type: 'addRoleError', shardId: client.shard.ids[0], error: error.message });
    }
  } else if (message.type === 'removeRole') {
    try {
      const guild = await client.guilds.fetch(message.data.guildId);
      const member = await client.guilds.cache.get(message.data.guildId).members.fetch(message.data.userId);
      const role = guild.roles.cache.get(message.data.roleId);
      await member.roles.remove(role);
      process.send({ type: 'removeRoleSuccess', shardId: client.shard.ids[0] });
    } catch (error) {
      console.error(`Shard ${client.shard.ids[0]} failed to remove role:`, error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { shardId: client.shard.ids[0], type: 'removeRole', guildId: message.data.guildId, userId: message.data.userId, roleId: message.data.roleId } });
      }
      process.send({ type: 'removeRoleError', shardId: client.shard.ids[0], error: error.message });
    }
  }
});

// Capture unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in shard:', reason, promise);
  if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    Sentry.captureException(reason, { tags: { type: 'unhandledRejection', shardId: client.shard.ids[0] } });
  }
});

process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught Exception in shard:', err, origin);
  if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    Sentry.captureException(err, { tags: { type: 'uncaughtException', shardId: client.shard.ids[0] } });
  }
  process.exit(1);
});