const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS claims (
      id SERIAL PRIMARY KEY,
      claimant_name TEXT NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      claim_date DATE NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('groceries', 'ice', 'other')),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_comment TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

module.exports = { query, initialize };
