require('dotenv').config();
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require("@sentry/profiling-integration");

if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new Sentry.Integrations.Express({ app: app }),
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    release: process.env.SENTRY_RELEASE || 'discordlinked@1.0.0',
  });
}

const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

const config = require('./config');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;

// The request handler must be the first middleware on the app
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// Discord Bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`Discord Bot Ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

client.login(process.env.DISCORD_TOKEN);

// Web Server setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({
    pool: db.pool, // Use the existing pg.Pool from db.js
    tableName: process.env.PG_SESSION_TABLE_NAME || 'session',
  }),
  secret: process.env.SESSION_SECRET || 'a_very_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
  },
}));

app.use(passport.initialize());
app.use(passport.session());

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
      // Check if the user is part of any guild where the bot is present
      // and has the required admin roles.
      const guilds = await client.guilds.fetch();
      let hasAccess = false;
      let userGuilds = [];

      for (const guildOAuth of profile.guilds) {
        const guild = guilds.get(guildOAuth.id);
        if (guild) {
          userGuilds.push(guild.id);
          try {
            const member = await guild.members.fetch(profile.id);
            const botAdminRoleId = process.env.BOT_ADMIN_ROLE_ID;
            const botReadonlyAdminRoleId = process.env.BOT_READONLY_ADMIN_ROLE_ID;

            if (botAdminRoleId && member.roles.cache.has(botAdminRoleId)) {
              hasAccess = true;
            }
            if (botReadonlyAdminRoleId && member.roles.cache.has(botReadonlyAdminRoleId)) {
              hasAccess = true;
            }
          } catch (memberError) {
            console.warn(`Could not fetch member ${profile.id} in guild ${guild.name}:`, memberError.message);
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

app.get('/', (req, res) => {
  res.send('WebhookMaster Discord Bot Web Interface');
});

// Discord OAuth2 routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/dashboard'); // Redirect to your dashboard after successful login
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

// Protected dashboard route
app.get('/dashboard', ensureAuthenticated, (req, res) => {
  res.send('Welcome to the DiscordLinked Dashboard!'); // This will eventually serve your React app
});

// Webhook ingestion endpoint (example)
app.post('/webhooks/:platform/:guildId', (req, res) => {
  const { platform, guildId } = req.params;
  console.log(`Received webhook from ${platform} for guild ${guildId}:`, req.body);
  // TODO: Process webhook, interact with Discord API
  res.status(200).send('Webhook received');
});

app.post('/api/bot/presence', ensureAuthenticated, (req, res) => {
  const { status, activityType, activityName } = req.body;

  if (!client.isReady()) {
    return res.status(503).send('Bot not ready');
  }

  try {
    client.user.setPresence({
      status: status,
      activities: [{
        name: activityName,
        type: activityType,
      }],
    });
    res.status(200).send('Bot presence updated');
  } catch (error) {
    console.error('Failed to update bot presence:', error);
    res.status(500).send('Failed to update bot presence');
  }
});

app.get('/api/user', ensureAuthenticated, (req, res) => {
  res.json(req.user);
});

// The error handler must be before any other error middleware and after all controllers
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned to the client
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
  } else {
    console.log('Database connected:', res.rows[0].now);
  }
});
