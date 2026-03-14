const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'cafe-claims.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database at', DB_PATH);
});

// Helper: run a statement that modifies data (INSERT, UPDATE, DELETE, CREATE)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Helper: fetch one row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper: fetch all rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize schema and seed data
async function initialize() {
  // Enable WAL mode and foreign keys
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA foreign_keys = ON');

  // Create tables
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      claim_date TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('groceries', 'ice', 'other')),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_comment TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed admin user
  const adminExists = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminExists) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    await run(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      ['admin', adminHash, 'Admin', 'admin']
    );
    console.log('Seeded admin user');
  }

  // Seed member user
  const memberExists = await get('SELECT id FROM users WHERE username = ?', ['member1']);
  if (!memberExists) {
    const memberHash = bcrypt.hashSync('member123', 10);
    await run(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      ['member1', memberHash, 'Member One', 'member']
    );
    console.log('Seeded member1 user');
  }
}

module.exports = { db, run, get, all, initialize };
