const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sneinton2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple admin auth middleware
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized. Invalid admin password.' });
  }
  next();
}

// API Routes
const registrationRoutes = require('./routes/registrations');
const importRoutes = require('./routes/import');

app.use('/api/registrations', registrationRoutes);
app.use('/api/import', adminAuth, importRoutes);

// Serve frontend static assets (CSS, JS, images)
// Disable extensions and index fallback to prevent static from catching our routes
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  index: false,
  extensions: false
}));

// Explicit page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'register.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n⚽ Sneinton Town Youth FC — £1 Saturday Soccer School`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`   Admin panel: http://localhost:${PORT}/admin`);
  console.log(`   Admin password: ${ADMIN_PASSWORD}\n`);
});
