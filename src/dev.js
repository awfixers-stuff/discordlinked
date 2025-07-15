require('dotenv').config();
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require("@sentry/profiling-integration");

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const db = require('./db');
const stripe = require('stripe')(config.stripeSecretKey);

const app = express();
const port = process.env.PORT || 3000;

// Sentry initialization for the main process (web server)
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    release: process.env.SENTRY_RELEASE || 'discordlinked@1.0.0',
  });
  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

const { Client, GatewayIntentBits } = require('discord.js');

// Discord Bot setup (single instance)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Development Bot Ready! Logged in as ${client.user.tag}`);
  if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    Sentry.captureMessage(`Development Bot Ready`);
  }
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

client.login(process.env.DISCORD_TOKEN);

// Local sendToShard function for development
async function sendToShard(guildId, message) {
  // In dev mode, we directly call the client methods
  if (message.type === 'presenceUpdate') {
    client.user.setPresence({
      status: message.data.status,
      activities: [{
        name: message.data.activityName,
        type: message.data.activityType,
      }],
    });
    return { success: true };
  } else if (message.type === 'fetchGuild') {
    return await client.guilds.fetch(message.data.guildId);
  } else if (message.type === 'fetchGuilds') {
    const guilds = await client.guilds.fetch();
    return guilds.map(g => ({ id: g.id, name: g.name }));
  } else if (message.type === 'fetchMembers') {
    const guild = await client.guilds.fetch(message.data.guildId);
    const members = await guild.members.fetch();
    return members.map(member => ({
      id: member.id,
      username: member.user.username,
      discriminator: member.user.discriminator,
      tag: member.user.tag,
      roles: member.roles.cache.map(role => ({ id: role.id, name: role.name })),
    }));
  } else if (message.type === 'fetchMember') {
    const guild = await client.guilds.fetch(message.data.guildId);
    return await guild.members.fetch(message.data.userId);
  } else if (message.type === 'addRole') {
    const guild = await client.guilds.fetch(message.data.guildId);
    const member = await guild.members.fetch(message.data.userId);
    const role = guild.roles.cache.get(message.data.roleId);
    await member.roles.add(role);
    return { success: true };
  } else if (message.type === 'removeRole') {
    const guild = await client.guilds.fetch(message.data.guildId);
    const member = await guild.members.fetch(message.data.userId);
    const role = guild.roles.cache.get(message.data.roleId);
    await member.roles.remove(role);
    return { success: true };
  }
  throw new Error('Unknown IPC message type in dev mode');
}

// Web Server setup
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({
    pool: db.pool,
    tableName: process.env.PG_SESSION_TABLE_NAME || 'session',
  }),
  secret: process.env.SESSION_SECRET || 'a_very_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// Add user context to Sentry for authenticated requests
app.use((req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    Sentry.setUser({ id: req.user.id, username: req.user.username });
  } else {
    Sentry.setUser(null);
  }
  next();
});

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_REDIRECT_URI,
    scope: ['identify', 'guilds'],
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const userGuilds = profile.guilds.map(g => g.id);
      const botGuilds = await client.guilds.fetch(); // Directly fetch from the single client
      const allBotGuilds = botGuilds.map(g => g.id);

      let hasAccess = false;
      for (const guildId of userGuilds) {
        if (allBotGuilds.includes(guildId)) {
          try {
            const member = await client.guilds.cache.get(guildId).members.fetch(profile.id);
            const botAdminRoleId = process.env.BOT_ADMIN_ROLE_ID;
            const botReadonlyAdminRoleId = process.env.BOT_READONLY_ADMIN_ROLE_ID;

            if (botAdminRoleId && member.roles.cache.has(botAdminRoleId)) {
              hasAccess = true;
              break;
            }
            if (botReadonlyAdminRoleId && member.roles.cache.has(botReadonlyAdminRoleId)) {
              hasAccess = true;
              break;
            }
          } catch (memberError) {
            console.warn(`Could not fetch member ${profile.id} in guild ${guildId}:`, memberError.message);
            if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
              Sentry.captureException(memberError, { tags: { userId: profile.id, guildId: guildId } });
            }
          }
        }
      }

      if (hasAccess) {
        return done(null, { ...profile, hasAccess: true });
      } else {
        return done(null, false, { message: 'You do not have the required roles to access the dashboard.' });
      }
    } catch (error) {
      console.error('Discord OAuth2 verification error:', error);
      if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
        Sentry.captureException(error, { tags: { oauth: true } });
      }
      return done(error);
    }
  }
));

// Middleware to check if user is authenticated and has access
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user.hasAccess) {
    return next();
  }
  res.redirect('/auth/discord');
}

// Rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

app.get('/', (req, res) => {
  res.send('WebhookMaster Discord Bot Web Interface');
});

const authRoutes = require('./routes/auth');
app.use('/auth', authLimiter, authRoutes);

// Protected dashboard route
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.send('Welcome to the DiscordLinked Dashboard!');
});

// Webhook ingestion endpoint (example)
app.post('/webhooks/:platform/:guildId', (req, res) => {
  const { platform, guildId } = req.params;
  console.log(`Received webhook from ${platform} for guild ${guildId}:`, req.body);
  // TODO: Process webhook, interact with Discord API
  res.status(200).send('Webhook received');
});

const stripeWebhookRoutes = require('./routes/stripeWebhook');
app.use('/api/stripe-webhook', stripeWebhookRoutes);

const stripeApiRoutes = require('./routes/stripeApi');
app.use('/api/stripe', ensureAuthenticated, stripeApiRoutes);

// Pass sendToShard to routes that need to interact with the bot
const botRoutes = require('./routes/bot')(sendToShard);
app.use('/api/bot', ensureAuthenticated, botRoutes);

const settingsRoutes = require('./routes/settings');
app.use('/api/settings', ensureAuthenticated, settingsRoutes);

const userRoutes = require('./routes/users')(sendToShard);
app.use('/api/users', ensureAuthenticated, userRoutes);

app.get('/api/user', ensureAuthenticated, (req, res) => {
  res.json(req.user);
});

// Sentry error handler (optional for dev)
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// Database connection test (example)
db.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error', err.stack);
    if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
      Sentry.captureException(err, { tags: { database: 'connection' } });
    }
  } else {
    console.log('Database connected:', res.rows[0].now);
  }
});

// Capture unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason, promise);
  if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    Sentry.captureException(reason);
  }
});

process.on('uncaughtException', (err, origin) => {
  console.error('Uncaught Exception:', err, origin);
  if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  process.exit(1);
});