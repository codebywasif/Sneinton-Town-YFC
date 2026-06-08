/**
 * Main.js — Landing page interactions
 * Handles: navbar scroll, mobile nav, scroll animations
 */

// ── Navbar scroll effect ──
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ── Mobile navigation toggle ──
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  navToggle.textContent = navLinks.classList.contains('open') ? '✕' : '☰';
});

// Close mobile nav when clicking a link
navLinks?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.textContent = '☰';
  });
});

// ── Scroll animations (Intersection Observer) ──
const animateElements = document.querySelectorAll('[data-animate]');

const observerOptions = {
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      // Stagger the animation delay based on sibling index
      const siblings = entry.target.parentElement.querySelectorAll('[data-animate]');
      const siblingIndex = Array.from(siblings).indexOf(entry.target);
      
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, siblingIndex * 120);
      
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

animateElements.forEach(el => observer.observe(el));

// ── Smooth scroll for anchor links ──
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const offset = 80; // navbar height
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ── Dynamic "next Saturday" date ──
function getNextSaturday() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  const nextSat = new Date(now);
  nextSat.setDate(now.getDate() + daysUntilSaturday);
  return nextSat.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// Update badge if needed
const badge = document.querySelector('.hero-badge');
if (badge && !badge.textContent.includes('Starting')) {
  badge.innerHTML = `<span class="pulse"></span> Next session: ${getNextSaturday()}`;
}
