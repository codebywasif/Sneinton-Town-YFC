const express = require('express');
const router = express.Router();
const db = require('../db');

// Create a new registration
router.post('/', async (req, res) => {
  const {
    parent_name,
    parent_email,
    parent_phone,
    child_name,
    child_dob,
    child_gender,
    session,
    medical_info,
    photo_consent
  } = req.body;

  // Validate required fields
  if (!parent_name || !parent_phone || !child_name || !child_dob || !session) {
    return res.status(400).json({
      error: 'Missing required fields: parent_name, parent_phone, child_name, child_dob, session'
    });
  }

  // Validate session value
  const validSessions = ['10-11-mixed', '11-12-mixed', '1-2-girls'];
  if (!validSessions.includes(session)) {
    return res.status(400).json({
      error: 'Invalid session. Must be one of: ' + validSessions.join(', ')
    });
  }

  try {
    const result = await db.run(
      `INSERT INTO registrations (parent_name, parent_email, parent_phone, child_name, child_dob, child_gender, session, medical_info, photo_consent, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'website')`,
      [
        parent_name,
        parent_email || null,
        parent_phone,
        child_name,
        child_dob,
        child_gender || null,
        session,
        medical_info || null,
        photo_consent !== undefined ? (photo_consent ? 1 : 0) : 1
      ]
    );

    res.status(201).json({
      message: 'Registration successful!',
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to save registration. Please try again.' });
  }
});

// Get all registrations (admin)
router.get('/', async (req, res) => {
  const { search, session, source } = req.query;

  let query = 'SELECT * FROM registrations WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (child_name LIKE ? OR parent_name LIKE ? OR parent_phone LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (session) {
    query += ' AND session = ?';
    params.push(session);
  }

  if (source) {
    query += ' AND source = ?';
    params.push(source);
  }

  query += ' ORDER BY created_at DESC';

  try {
    const rows = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve registrations.' });
  }
});

// Get registration stats
router.get('/stats', async (req, res) => {
  try {
    const total = await db.queryOne('SELECT COUNT(*) as count FROM registrations');
    const bySession = await db.query('SELECT session, COUNT(*) as count FROM registrations GROUP BY session');
    const bySource = await db.query('SELECT source, COUNT(*) as count FROM registrations GROUP BY source');
    const recent = await db.queryOne("SELECT COUNT(*) as count FROM registrations WHERE created_at >= datetime('now', '-7 days')");

    res.json({
      total: total ? total.count : 0,
      bySession,
      bySource,
      recentWeek: recent ? recent.count : 0
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve stats.' });
  }
});

// Export as CSV
router.get('/export', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM registrations ORDER BY created_at DESC');

    const headers = ['ID', 'Parent Name', 'Email', 'Phone', 'Child Name', 'Date of Birth', 'Gender', 'Session', 'Medical Info', 'Photo Consent', 'Source', 'Registered At'];
    const csvRows = rows.map(row => [
      row.id,
      `"${(row.parent_name || '').replace(/"/g, '""')}"`,
      `"${(row.parent_email || '').replace(/"/g, '""')}"`,
      `"${(row.parent_phone || '').replace(/"/g, '""')}"`,
      `"${(row.child_name || '').replace(/"/g, '""')}"`,
      row.child_dob,
      row.child_gender || '',
      row.session,
      `"${(row.medical_info || '').replace(/"/g, '""')}"`,
      row.photo_consent ? 'Yes' : 'No',
      row.source,
      row.created_at
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=registrations.csv');
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export registrations.' });
  }
});

// Delete a registration
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.run('DELETE FROM registrations WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Registration not found.' });
    }

    res.json({ message: 'Registration deleted.' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete registration.' });
  }
});

module.exports = router;
