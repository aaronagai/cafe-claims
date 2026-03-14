const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { run, get, all, initialize } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'cafe-claims-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Auth Routes ────────────────────────────────────────────────────────────────

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/me
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// ── Claims Routes ──────────────────────────────────────────────────────────────

// POST /api/claims — submit a new claim
app.post('/api/claims', requireAuth, async (req, res) => {
  try {
    const { description, amount, claim_date, category, notes } = req.body;

    if (!description || !amount || !claim_date || !category) {
      return res.status(400).json({ error: 'Description, amount, date, and category are required' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const validCategories = ['groceries', 'ice', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const result = await run(
      `INSERT INTO claims (user_id, description, amount, claim_date, category, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.session.user.id,
        description.trim(),
        parsedAmount,
        claim_date,
        category,
        notes ? notes.trim() : null
      ]
    );

    res.json({ success: true, claim_id: result.lastID });
  } catch (err) {
    console.error('Error inserting claim:', err);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

// GET /api/claims — member sees own claims; admin sees all
app.get('/api/claims', requireAuth, async (req, res) => {
  try {
    let claims;
    if (req.session.user.role === 'admin') {
      claims = await all(`
        SELECT c.*, u.display_name as submitter_name, u.username as submitter_username
        FROM claims c
        JOIN users u ON c.user_id = u.id
        ORDER BY c.created_at DESC
      `);
    } else {
      claims = await all(`
        SELECT c.*, u.display_name as submitter_name
        FROM claims c
        JOIN users u ON c.user_id = u.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
      `, [req.session.user.id]);
    }
    res.json({ claims });
  } catch (err) {
    console.error('Error fetching claims:', err);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// GET /api/claims/pending — admin only
app.get('/api/claims/pending', requireAdmin, async (req, res) => {
  try {
    const claims = await all(`
      SELECT c.*, u.display_name as submitter_name, u.username as submitter_username
      FROM claims c
      JOIN users u ON c.user_id = u.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at ASC
    `);
    res.json({ claims });
  } catch (err) {
    console.error('Error fetching pending claims:', err);
    res.status(500).json({ error: 'Failed to fetch pending claims' });
  }
});

// GET /api/claims/stats — admin only
app.get('/api/claims/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_approved_amount
      FROM claims
    `);
    res.json({ stats });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// PATCH /api/claims/:id — admin approves or rejects
app.patch('/api/claims/:id', requireAdmin, async (req, res) => {
  try {
    const claimId = parseInt(req.params.id, 10);
    const { status, admin_comment } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
    }

    const claim = await get('SELECT * FROM claims WHERE id = ?', [claimId]);
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending claims can be reviewed' });
    }

    await run(
      `UPDATE claims
       SET status = ?, admin_comment = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        status,
        admin_comment ? admin_comment.trim() : null,
        req.session.user.id,
        claimId
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating claim:', err);
    res.status(500).json({ error: 'Failed to update claim' });
  }
});

// ── Page Routes ────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────

initialize()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\nCafe Claims app running at http://localhost:${PORT}`);
      console.log('Default users:');
      console.log('  Admin   — username: admin    password: admin123');
      console.log('  Member  — username: member1  password: member123\n');
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
