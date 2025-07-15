
const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to ensure user is authenticated and has admin access
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.hasAccess) {
    return next();
  }
  res.status(403).send('Forbidden');
}

// Get all settings
router.get('/', ensureAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).send('Failed to fetch settings');
  }
});

// Get a specific setting by key
router.get('/:key', ensureAdmin, async (req, res) => {
  const { key } = req.params;
  try {
    const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (rows.length > 0) {
      res.json(rows[0].value);
    } else {
      res.status(404).send('Setting not found');
    }
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    res.status(500).send('Failed to fetch setting');
  }
});

// Create or update a setting
router.post('/', ensureAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).send('Key and value are required');
  }

  try {
    const { rowCount } = await db.query(
      'INSERT INTO settings(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
    if (rowCount > 0) {
      res.status(200).send('Setting saved successfully');
    } else {
      res.status(500).send('Failed to save setting');
    }
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).send('Failed to save setting');
  }
});

// Delete a setting
router.delete('/:key', ensureAdmin, async (req, res) => {
  const { key } = req.params;
  try {
    const { rowCount } = await db.query('DELETE FROM settings WHERE key = $1', [key]);
    if (rowCount > 0) {
      res.status(200).send('Setting deleted successfully');
    } else {
      res.status(404).send('Setting not found');
    }
  } catch (error) {
    console.error(`Error deleting setting ${key}:`, error);
    res.status(500).send('Failed to delete setting');
  }
});

module.exports = router;
