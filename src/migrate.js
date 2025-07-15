const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const migrationsDir = path.join(__dirname, '../migrations');

async function runMigrations() {
  try {
    const client = await pool.connect();
    console.log('Connected to database for migrations.');

    const files = fs.readdirSync(migrationsDir).sort();

    for (const file of files) {
      if (file.endsWith('.sql')) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`Running migration: ${file}`);
        await client.query(sql);
        console.log(`Migration ${file} completed.`);
      }
    }

    client.release();
    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
