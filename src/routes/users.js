
const express = require('express');
const router = express.Router();

// Middleware to ensure user is authenticated and has admin access
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.hasAccess) {
    return next();
  }
  res.status(403).send('Forbidden');
}

module.exports = (sendToShard) => {
  // Get users for a specific guild
  router.get('/:guildId', ensureAdmin, async (req, res) => {
    const { guildId } = req.params;
    try {
      const guild = await sendToShard(guildId, { type: 'fetchGuild', data: { guildId } });
      if (!guild) {
        return res.status(404).send('Guild not found or bot is not in this guild.');
      }

      // Fetch members from the shard
      const members = await sendToShard(guildId, { type: 'fetchMembers', data: { guildId } });
      const usersInGuild = [];

      members.forEach(member => {
        usersInGuild.push({
          id: member.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          tag: member.user.tag,
          roles: member.roles.cache.map(role => ({ id: role.id, name: role.name })),
        });
      });

      res.json(usersInGuild);
    } catch (error) {
      console.error(`Error fetching users for guild ${guildId}:`, error);
      res.status(500).send('Failed to fetch users for guild.');
    }
  });

  // Add/remove roles for a user in a specific guild
  router.post('/:guildId/:userId/roles', ensureAdmin, async (req, res) => {
    const { guildId, userId } = req.params;
    const { roleId, action } = req.body; // action can be 'add' or 'remove'

    if (!roleId || !action || !['add', 'remove'].includes(action)) {
      return res.status(400).send('Role ID and a valid action (add/remove) are required.');
    }

    try {
      if (action === 'add') {
        await sendToShard(guildId, { type: 'addRole', data: { guildId, userId, roleId } });
        res.status(200).send(`Role added to user.`);
      } else if (action === 'remove') {
        await sendToShard(guildId, { type: 'removeRole', data: { guildId, userId, roleId } });
        res.status(200).send(`Role removed from user.`);
      }
    } catch (error) {
      console.error(`Error ${action}ing role ${roleId} for user ${userId} in guild ${guildId}:`, error);
      res.status(500).send(`Failed to ${action} role.`);
    }
  });

  return router;
};
