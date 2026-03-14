const express = require('express');
const path = require('path');
const { run, get, all, initialize } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// POST /api/claims — submit a new claim
app.post('/api/claims', async (req, res) => {
  try {
    const { claimant_name, description, amount, claim_date, category, notes } = req.body;

    if (!claimant_name || !description || !amount || !claim_date || !category) {
      return res.status(400).json({ error: 'Name, description, amount, date, and category are required' });
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
      `INSERT INTO claims (claimant_name, description, amount, claim_date, category, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [claimant_name.trim(), description.trim(), parsedAmount, claim_date, category, notes ? notes.trim() : null]
    );

    res.json({ success: true, claim_id: result.lastID });
  } catch (err) {
    console.error('Error inserting claim:', err);
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

// GET /api/claims — all claims
app.get('/api/claims', async (req, res) => {
  try {
    const claims = await all(`SELECT * FROM claims ORDER BY created_at DESC`);
    res.json({ claims });
  } catch (err) {
    console.error('Error fetching claims:', err);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// GET /api/claims/pending
app.get('/api/claims/pending', async (req, res) => {
  try {
    const claims = await all(`SELECT * FROM claims WHERE status = 'pending' ORDER BY created_at ASC`);
    res.json({ claims });
  } catch (err) {
    console.error('Error fetching pending claims:', err);
    res.status(500).json({ error: 'Failed to fetch pending claims' });
  }
});

// GET /api/claims/stats
app.get('/api/claims/stats', async (req, res) => {
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

// PATCH /api/claims/:id — approve or reject
app.patch('/api/claims/:id', async (req, res) => {
  try {
    const claimId = parseInt(req.params.id, 10);
    const { status, admin_comment } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
    }

    const claim = await get('SELECT * FROM claims WHERE id = ?', [claimId]);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending claims can be reviewed' });
    }

    await run(
      `UPDATE claims SET status = ?, admin_comment = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, admin_comment ? admin_comment.trim() : null, claimId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating claim:', err);
    res.status(500).json({ error: 'Failed to update claim' });
  }
});

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

initialize()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\nCafe Claims running at http://localhost:${PORT}`);
      console.log(`Admin panel at http://localhost:${PORT}/admin\n`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
