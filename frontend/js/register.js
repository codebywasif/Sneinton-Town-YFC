/**
 * Register.js — Registration form logic
 * Handles: form validation, submission, session pre-selection from URL
 */

const API_BASE = window.location.origin;

// ── Pre-select session from URL query param ──
const urlParams = new URLSearchParams(window.location.search);
const preSession = urlParams.get('session');
if (preSession) {
  const sessionSelect = document.getElementById('session');
  if (sessionSelect) {
    sessionSelect.value = preSession;
  }
}

// ── Form submission ──
const form = document.getElementById('regForm');
const submitBtn = document.getElementById('submitBtn');
const formError = document.getElementById('formError');
const formSection = document.getElementById('registrationForm');
const formSuccess = document.getElementById('formSuccess');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Clear previous errors
  formError.classList.remove('show');
  formError.textContent = '';

  // Validate required fields
  const parentName = document.getElementById('parentName').value.trim();
  const parentPhone = document.getElementById('parentPhone').value.trim();
  const parentEmail = document.getElementById('parentEmail').value.trim();
  const childName = document.getElementById('childName').value.trim();
  const childDob = document.getElementById('childDob').value;
  const childGender = document.getElementById('childGender').value;
  const session = document.getElementById('session').value;
  const medicalInfo = document.getElementById('medicalInfo').value.trim();
  const photoConsent = document.getElementById('photoConsent').checked;
  const termsAccept = document.getElementById('termsAccept').checked;

  // Client-side validation
  if (!parentName) return showError('Please enter the parent/guardian name.');
  if (!parentPhone) return showError('Please enter a contact phone number.');
  if (!childName) return showError("Please enter the child's name.");
  if (!childDob) return showError("Please enter the child's date of birth.");
  if (!session) return showError('Please select a session.');
  if (!termsAccept) return showError('Please confirm you understand the shin pads and footwear requirements.');

  // Age validation
  const dob = new Date(childDob);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }

  // Check age range for session
  if (session === '10-11-mixed' && (age < 6 || age > 11)) {
    return showError('The 10–11am session is for ages 6–11. Please choose the appropriate session for your child.');
  }
  if (session === '11-12-mixed' && (age < 11 || age > 16)) {
    return showError('The 11am–12pm session is for ages 11–16. Please choose the appropriate session for your child.');
  }
  if (session === '1-2-girls' && (age < 6 || age > 13)) {
    return showError('The 1–2pm Girls Only session is for ages 6–13. Please choose the appropriate session for your child.');
  }

  // Submit
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Registering...';

  try {
    const response = await fetch(`${API_BASE}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_name: parentName,
        parent_email: parentEmail || null,
        parent_phone: parentPhone,
        child_name: childName,
        child_dob: childDob,
        child_gender: childGender || null,
        session,
        medical_info: medicalInfo || null,
        photo_consent: photoConsent
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed. Please try again.');
    }

    // Show success
    formSection.style.display = 'none';
    formSuccess.classList.add('show');
    showToast('Registration successful! 🎉', 'success');

  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Register My Child ⚽';
  }
});

function showError(message) {
  formError.textContent = message;
  formError.classList.add('show');
  formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Reset form for another registration ──
function resetForm() {
  formSection.style.display = 'block';
  formSuccess.classList.remove('show');
  form.reset();
  submitBtn.disabled = false;
  submitBtn.innerHTML = 'Register My Child ⚽';
  formError.classList.remove('show');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Make resetForm available globally
window.resetForm = resetForm;

// ── Toast notifications ──
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
