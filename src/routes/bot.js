
const express = require('express');
const router = express.Router();

module.exports = (sendToShard) => {
  router.post('/presence', async (req, res) => {
    const { status, activityType, activityName } = req.body;

    try {
      // We don't have a guildId here, so we'll broadcast to all shards
      // This assumes presence updates are global for the bot
      await sendToShard(null, { type: 'presenceUpdate', data: { status, activityType, activityName } });
      res.status(200).send('Bot presence updated');
    } catch (error) {
      console.error('Failed to update bot presence:', error);
      res.status(500).send('Failed to update bot presence');
    }
  });

  return router;
};
