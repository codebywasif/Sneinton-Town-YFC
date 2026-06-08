/**
 * Admin.js — Admin dashboard logic
 * Handles: login, stats, table rendering, search/filter, CSV import/export, delete
 */

const API_BASE = window.location.origin;
let adminPassword = '';

// ── DOM Elements ──
const adminLogin = document.getElementById('adminLogin');
const adminDashboard = document.getElementById('adminDashboard');
const loginBtn = document.getElementById('loginBtn');
const passwordInput = document.getElementById('adminPassword');
const searchInput = document.getElementById('searchInput');
const filterSession = document.getElementById('filterSession');
const filterSource = document.getElementById('filterSource');
const registrationsBody = document.getElementById('registrationsBody');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const importModal = document.getElementById('importModal');
const cancelImportBtn = document.getElementById('cancelImport');
const confirmImportBtn = document.getElementById('confirmImport');
const uploadArea = document.getElementById('uploadArea');
const csvFileInput = document.getElementById('csvFileInput');
const importResult = document.getElementById('importResult');

// ── Login ──
loginBtn?.addEventListener('click', attemptLogin);
passwordInput?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') attemptLogin();
});

async function attemptLogin() {
  adminPassword = passwordInput.value;
  
  if (!adminPassword) {
    showToast('Please enter the admin password.', 'error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span> Verifying...';

  try {
    // Test auth by fetching stats
    const res = await fetch(`${API_BASE}/api/registrations/stats`, {
      headers: { 'X-Admin-Password': adminPassword }
    });

    if (res.status === 401) {
      throw new Error('Invalid password');
    }

    // Success — show dashboard
    adminLogin.style.display = 'none';
    adminDashboard.classList.add('show');
    
    loadStats();
    loadRegistrations();
    showToast('Welcome to the admin dashboard! 🎉', 'success');
  } catch (err) {
    showToast('Invalid password. Please try again.', 'error');
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Unlock Dashboard';
    passwordInput.value = '';
    passwordInput.focus();
  }
}

// ── Load Stats ──
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/registrations/stats`, {
      headers: { 'X-Admin-Password': adminPassword }
    });
    const data = await res.json();

    document.getElementById('statTotal').textContent = data.total || 0;
    document.getElementById('statRecent').textContent = data.recentWeek || 0;

    const websiteCount = data.bySource?.find(s => s.source === 'website')?.count || 0;
    const googleCount = data.bySource?.find(s => s.source === 'google_forms')?.count || 0;
    document.getElementById('statWebsite').textContent = websiteCount;
    document.getElementById('statGoogle').textContent = googleCount;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ── Load Registrations ──
let searchTimeout;

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadRegistrations, 300);
});

filterSession?.addEventListener('change', loadRegistrations);
filterSource?.addEventListener('change', loadRegistrations);

async function loadRegistrations() {
  const search = searchInput?.value || '';
  const session = filterSession?.value || '';
  const source = filterSource?.value || '';

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (session) params.set('session', session);
  if (source) params.set('source', source);

  try {
    const res = await fetch(`${API_BASE}/api/registrations?${params.toString()}`, {
      headers: { 'X-Admin-Password': adminPassword }
    });
    const registrations = await res.json();

    renderTable(registrations);
  } catch (err) {
    console.error('Failed to load registrations:', err);
    registrationsBody.innerHTML = '<tr><td colspan="8" class="table-empty">Failed to load registrations.</td></tr>';
  }
}

function renderTable(registrations) {
  if (!registrations.length) {
    registrationsBody.innerHTML = '<tr><td colspan="8" class="table-empty">No registrations found. They\'ll appear here once parents sign up! ⚽</td></tr>';
    return;
  }

  registrationsBody.innerHTML = registrations.map(reg => {
    const sessionLabels = {
      '10-11-mixed': '10–11 Mixed',
      '11-12-mixed': '11–12 Mixed',
      '1-2-girls': '1–2 Girls'
    };
    const sessionClass = {
      '10-11-mixed': 'mixed-young',
      '11-12-mixed': 'mixed-old',
      '1-2-girls': 'girls'
    };

    const date = new Date(reg.created_at);
    const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

    return `
      <tr>
        <td>
          <strong>${escapeHtml(reg.child_name)}</strong>
          ${reg.child_gender ? `<br><small style="color:var(--text-muted)">${escapeHtml(reg.child_gender)}</small>` : ''}
        </td>
        <td>${escapeHtml(reg.parent_name)}</td>
        <td>
          ${escapeHtml(reg.parent_phone)}
          ${reg.parent_email ? `<br><small style="color:var(--text-muted)">${escapeHtml(reg.parent_email)}</small>` : ''}
        </td>
        <td><span class="session-badge ${sessionClass[reg.session] || ''}">${sessionLabels[reg.session] || reg.session}</span></td>
        <td>${escapeHtml(reg.child_dob)}</td>
        <td><span class="source-badge ${reg.source === 'google_forms' ? 'google' : 'website'}">${reg.source === 'google_forms' ? 'Google' : 'Website'}</span></td>
        <td><small>${formattedDate}</small></td>
        <td><button class="btn-delete" onclick="deleteRegistration(${reg.id})">Delete</button></td>
      </tr>
    `;
  }).join('');
}

// ── Delete Registration ──
window.deleteRegistration = async function(id) {
  if (!confirm('Are you sure you want to delete this registration?')) return;

  try {
    const res = await fetch(`${API_BASE}/api/registrations/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Password': adminPassword }
    });

    if (!res.ok) throw new Error('Failed to delete');

    showToast('Registration deleted.', 'info');
    loadRegistrations();
    loadStats();
  } catch (err) {
    showToast('Failed to delete registration.', 'error');
  }
};

// ── Export CSV ──
exportBtn?.addEventListener('click', () => {
  window.open(`${API_BASE}/api/registrations/export`, '_blank');
  showToast('CSV export started.', 'success');
});

// ── Import Modal ──
let selectedFile = null;

importBtn?.addEventListener('click', () => {
  importModal.classList.add('show');
  importResult.classList.remove('show');
  importResult.innerHTML = '';
  selectedFile = null;
  document.getElementById('selectedFile').style.display = 'none';
  confirmImportBtn.disabled = true;
});

cancelImportBtn?.addEventListener('click', () => {
  importModal.classList.remove('show');
});

importModal?.addEventListener('click', (e) => {
  if (e.target === importModal) {
    importModal.classList.remove('show');
  }
});

// Upload area interactions
uploadArea?.addEventListener('click', () => csvFileInput.click());

uploadArea?.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea?.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea?.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    selectFile(file);
  } else {
    showToast('Please drop a CSV file.', 'error');
  }
});

csvFileInput?.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    selectFile(e.target.files[0]);
  }
});

function selectFile(file) {
  selectedFile = file;
  document.getElementById('fileName').textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  document.getElementById('selectedFile').style.display = 'block';
  confirmImportBtn.disabled = false;
}

// Confirm Import
confirmImportBtn?.addEventListener('click', async () => {
  if (!selectedFile) return;

  confirmImportBtn.disabled = true;
  confirmImportBtn.innerHTML = '<span class="spinner"></span> Importing...';

  const formData = new FormData();
  formData.append('csvfile', selectedFile);

  try {
    const res = await fetch(`${API_BASE}/api/import/google-forms`, {
      method: 'POST',
      headers: { 'X-Admin-Password': adminPassword },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Import failed');

    importResult.classList.remove('error');
    importResult.classList.add('show');
    importResult.innerHTML = `
      <strong>✅ Import Complete!</strong><br>
      <span style="color:var(--green-300)">${data.imported} records imported</span>
      ${data.skipped > 0 ? `<br><span style="color:var(--gold-300)">${data.skipped} records skipped (duplicates or errors)</span>` : ''}
      ${data.errors?.length ? `<br><br><small style="color:var(--text-muted)">${data.errors.join('<br>')}</small>` : ''}
    `;

    showToast(`Imported ${data.imported} registrations! 🎉`, 'success');
    loadRegistrations();
    loadStats();

  } catch (err) {
    importResult.classList.add('error', 'show');
    importResult.innerHTML = `<strong>❌ Import Failed</strong><br>${err.message}`;
    showToast('Import failed: ' + err.message, 'error');
  }

  confirmImportBtn.disabled = false;
  confirmImportBtn.innerHTML = 'Import Data';
});

// ── Utilities ──
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}
