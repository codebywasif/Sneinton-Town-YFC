const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isPg = !!process.env.DATABASE_URL;
let pgPool = null;
let sqliteDb = null;

if (isPg) {
  console.log('Using PostgreSQL database');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Create registrations table in Postgres
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      parent_name TEXT NOT NULL,
      parent_email TEXT,
      parent_phone TEXT NOT NULL,
      child_name TEXT NOT NULL,
      child_dob TEXT NOT NULL,
      child_gender TEXT,
      session TEXT NOT NULL,
      medical_info TEXT,
      photo_consent INTEGER DEFAULT 1,
      source TEXT DEFAULT 'website',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(err => {
    console.error('Failed to initialize PostgreSQL table:', err);
  });
} else {
  console.log('Using SQLite database');
  const DB_PATH = path.join(__dirname, 'data', 'registrations.db');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_name TEXT NOT NULL,
      parent_email TEXT,
      parent_phone TEXT NOT NULL,
      child_name TEXT NOT NULL,
      child_dob TEXT NOT NULL,
      child_gender TEXT,
      session TEXT NOT NULL,
      medical_info TEXT,
      photo_consent INTEGER DEFAULT 1,
      source TEXT DEFAULT 'website',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Adapt SQLite query syntax to PostgreSQL if needed
 */
function adaptQuery(sql, params) {
  if (!isPg) {
    return { sql, params };
  }

  let pgSql = sql;

  // Replace SQLite datetime('now', '-7 days') with PG equivalent
  pgSql = pgSql.replace(/datetime\('now',\s*'-7 days'\)/gi, "NOW() - INTERVAL '7 days'");

  // Replace SQLite ? placeholders with PG $1, $2, $3...
  let paramIndex = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

  // For INSERT, append RETURNING id so we can get the new ID
  if (pgSql.trim().toUpperCase().startsWith('INSERT')) {
    pgSql += ' RETURNING id';
  }

  return { sql: pgSql, params };
}

// Unified Async Database API
const db = {
  isPg,

  async query(sql, params = []) {
    const adapted = adaptQuery(sql, params);
    if (isPg) {
      const res = await pgPool.query(adapted.sql, adapted.params);
      return res.rows;
    } else {
      return sqliteDb.prepare(adapted.sql).all(...adapted.params);
    }
  },

  async queryOne(sql, params = []) {
    const adapted = adaptQuery(sql, params);
    if (isPg) {
      const res = await pgPool.query(adapted.sql, adapted.params);
      return res.rows[0] || null;
    } else {
      return sqliteDb.prepare(adapted.sql).get(...adapted.params) || null;
    }
  },

  async run(sql, params = []) {
    const adapted = adaptQuery(sql, params);
    if (isPg) {
      const res = await pgPool.query(adapted.sql, adapted.params);
      const insertedRow = res.rows[0];
      return {
        changes: res.rowCount,
        lastInsertRowid: insertedRow ? insertedRow.id : null
      };
    } else {
      const res = sqliteDb.prepare(adapted.sql).run(...adapted.params);
      return {
        changes: res.changes,
        lastInsertRowid: res.lastInsertRowid
      };
    }
  },

  // Simplified transaction support for importing
  async transaction(callback) {
    if (isPg) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const runOnClient = async (sql, params = []) => {
          const adapted = adaptQuery(sql, params);
          const res = await client.query(adapted.sql, adapted.params);
          const insertedRow = res.rows[0];
          return {
            changes: res.rowCount,
            lastInsertRowid: insertedRow ? insertedRow.id : null
          };
        };
        const queryOneOnClient = async (sql, params = []) => {
          const adapted = adaptQuery(sql, params);
          const res = await client.query(adapted.sql, adapted.params);
          return res.rows[0] || null;
        };

        await callback({ run: runOnClient, queryOne: queryOneOnClient });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const tx = sqliteDb.transaction((cb) => {
        const runSync = (sql, params = []) => {
          const res = sqliteDb.prepare(sql).run(...params);
          return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
        };
        const queryOneSync = (sql, params = []) => {
          return sqliteDb.prepare(sql).get(...params) || null;
        };
        cb({ run: runSync, queryOne: queryOneSync });
      });
      tx(callback);
    }
  }
};

module.exports = db;
