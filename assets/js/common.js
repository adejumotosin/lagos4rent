import { WHATSAPP_NUMBER } from './config.js';

export const money = (value) => {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
  }).format(num);
};

export const dateFmt = (value) => value ? new Intl.DateTimeFormat('en-NG', {
  year: 'numeric', month: 'short', day: 'numeric'
}).format(new Date(value)) : '—';

export const dateTimeFmt = (value) => value ? new Intl.DateTimeFormat('en-NG', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
}).format(new Date(value)) : '—';

export const escapeHTML = (str = '') => String(str).replace(/[&<>'"]/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[ch]));

export const titleCase = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export const waLink = (message) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

export function listingWhatsApp(listing) {
  const message = `Hello Lagos4Rent, I am interested in ${listing.title} (${listing.reference_code}). Please share availability and next steps.`;
  return waLink(message);
}

export function generalWhatsApp() {
  return waLink('Hello Lagos4Rent, I would like help finding a property in Lagos.');
}

export function toast(message, type = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export function setLoading(button, loading, label = 'Please wait…') {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

export function initSiteChrome() {
  const toggle = document.querySelector('[data-mobile-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  toggle?.addEventListener('click', () => {
    menu?.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(menu?.classList.contains('open')));
  });

  document.querySelectorAll('[data-wa-general]').forEach((el) => {
    el.setAttribute('href', generalWhatsApp());
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener');
  });

  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
    const href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/';
    if ((href === '/' && path === '/') || (href !== '/' && path.startsWith(href))) a.classList.add('active');
  });
}

export function propertyCard(listing) {
  const img = listing.cover_url
    ? `<img src="${escapeHTML(listing.cover_url)}" alt="${escapeHTML(listing.title)}" loading="lazy">`
    : `<div class="property-placeholder"><img src="/assets/img/lagos4rent-logo.svg" alt=""></div>`;
  const frequency = listing.purpose === 'rent' && listing.rent_frequency ? ` / ${titleCase(listing.rent_frequency)}` : '';
  const statusClass = listing.availability_status === 'available' ? 'success' : listing.availability_status === 'reserved' ? 'warning' : 'danger';
  const facts = [
    listing.bedrooms != null ? `${listing.bedrooms} bed${listing.bedrooms === 1 ? '' : 's'}` : '',
    listing.bathrooms != null ? `${listing.bathrooms} bath${listing.bathrooms === 1 ? '' : 's'}` : '',
    listing.size_sqm ? `${Number(listing.size_sqm).toLocaleString()} sqm` : '',
  ].filter(Boolean);
  return `
  <article class="card property-card">
    <a href="/listings/${encodeURIComponent(listing.slug)}" aria-label="View ${escapeHTML(listing.title)}">
      <div class="property-media">
        ${img}
        <div class="badges">
          ${listing.featured ? '<span class="badge orange">Featured</span>' : ''}
          <span class="badge ${statusClass}">${escapeHTML(titleCase(listing.availability_status))}</span>
        </div>
      </div>
      <div class="property-body">
        <div class="property-meta"><span>${escapeHTML(listing.neighbourhood || listing.location)}</span><span>${escapeHTML(listing.reference_code)}</span></div>
        <h3 class="property-title">${escapeHTML(listing.title)}</h3>
        <div class="property-price">${money(listing.price)}<small>${escapeHTML(frequency)}</small></div>
        ${facts.length ? `<div class="property-facts">${facts.map(f => `<span>${escapeHTML(f)}</span>`).join('')}</div>` : ''}
      </div>
    </a>
  </article>`;
}

export function skeletonCards(count = 6) {
  return Array.from({length: count}, () => `
    <div class="skeleton-card"><div class="skeleton s1"></div><div class="skeleton s2"></div><div class="skeleton s3"></div></div>
  `).join('');
}

export function emptyListings(message = 'No properties match this search yet.') {
  return `<div class="empty-state" style="grid-column:1/-1">
    <div class="icon">⌂</div>
    <h3>No listings to show</h3>
    <p>${escapeHTML(message)}</p>
    <a class="btn btn-primary" href="/contact">Tell us what you need</a>
  </div>`;
}

export function buildQuery(obj) {
  const p = new URLSearchParams();
  for (const [k,v] of Object.entries(obj)) if (v !== undefined && v !== null && String(v).trim() !== '') p.set(k, v);
  return p.toString();
}

initSiteChrome();
