import { supabase } from './config.js';
import { emptyListings, propertyCard, skeletonCards, titleCase } from './common.js';

const grid = document.querySelector('#listings-grid');
const countEl = document.querySelector('#result-count');
const filterPanel = document.querySelector('#filter-panel');
const params = new URLSearchParams(location.search);
const form = document.querySelector('#filters-form');
const sortSelect = document.querySelector('#sort');
let allListings = [];

const fieldNames = ['purpose','property_type','neighbourhood','min_price','max_price','bedrooms','bathrooms','availability_status'];
for (const name of fieldNames) {
  const el = form?.elements.namedItem(name);
  if (el && params.has(name)) el.value = params.get(name);
}
for (const name of ['furnished','serviced','featured']) {
  const el = form?.elements.namedItem(name);
  if (el) el.checked = params.get(name) === 'true';
}
if (sortSelect) sortSelect.value = params.get('sort') || 'newest';

document.querySelector('#mobile-filter-btn')?.addEventListener('click', () => filterPanel?.classList.toggle('open'));

function currentFilters() {
  const fd = new FormData(form);
  const obj = Object.fromEntries(fd.entries());
  for (const name of ['furnished','serviced','featured']) obj[name] = form.elements.namedItem(name)?.checked ? 'true' : '';
  obj.sort = sortSelect?.value || 'newest';
  return obj;
}

function syncUrl() {
  const obj = currentFilters();
  const next = new URLSearchParams();
  for (const [k,v] of Object.entries(obj)) if (v != null && String(v).trim() !== '' && !(k === 'sort' && v === 'newest')) next.set(k,v);
  history.replaceState({}, '', `/listings${next.toString() ? `?${next}` : ''}`);
}

function renderChips(filters) {
  const wrap = document.querySelector('#active-filters');
  if (!wrap) return;
  const labels = {
    purpose: 'Purpose', property_type:'Type', neighbourhood:'Area', min_price:'Min price', max_price:'Max price', bedrooms:'Bedrooms', bathrooms:'Bathrooms', availability_status:'Status', furnished:'Furnished', serviced:'Serviced', featured:'Featured'
  };
  const chips = Object.entries(filters)
    .filter(([k,v]) => k !== 'sort' && v && v !== 'false')
    .map(([k,v]) => `<span class="filter-chip">${labels[k] || titleCase(k)}: ${titleCase(v)}</span>`);
  wrap.innerHTML = chips.join('');
}

function applyFilters() {
  const f = currentFilters();
  let rows = [...allListings];
  if (f.purpose) rows = rows.filter(x => x.purpose === f.purpose);
  if (f.property_type) rows = rows.filter(x => String(x.property_type).toLowerCase() === String(f.property_type).toLowerCase());
  if (f.neighbourhood) {
    const q = f.neighbourhood.toLowerCase();
    rows = rows.filter(x => `${x.neighbourhood || ''} ${x.location || ''}`.toLowerCase().includes(q));
  }
  if (f.min_price) rows = rows.filter(x => Number(x.price) >= Number(f.min_price));
  if (f.max_price) rows = rows.filter(x => Number(x.price) <= Number(f.max_price));
  if (f.bedrooms) rows = rows.filter(x => Number(x.bedrooms || 0) >= Number(f.bedrooms));
  if (f.bathrooms) rows = rows.filter(x => Number(x.bathrooms || 0) >= Number(f.bathrooms));
  if (f.availability_status) rows = rows.filter(x => x.availability_status === f.availability_status);
  if (f.furnished === 'true') rows = rows.filter(x => x.furnished);
  if (f.serviced === 'true') rows = rows.filter(x => x.serviced);
  if (f.featured === 'true') rows = rows.filter(x => x.featured);
  if (f.sort === 'price-asc') rows.sort((a,b) => Number(a.price)-Number(b.price));
  else if (f.sort === 'price-desc') rows.sort((a,b) => Number(b.price)-Number(a.price));
  else rows.sort((a,b) => new Date(b.published_at || b.created_at)-new Date(a.published_at || a.created_at));

  if (countEl) countEl.textContent = `${rows.length} ${rows.length === 1 ? 'property' : 'properties'}`;
  renderChips(f);
  grid.innerHTML = rows.length ? rows.map(propertyCard).join('') : emptyListings('Try adjusting your filters, or tell us what you need and we can assist directly.');
  syncUrl();
}

form?.addEventListener('submit', (e) => { e.preventDefault(); applyFilters(); filterPanel?.classList.remove('open'); });
sortSelect?.addEventListener('change', applyFilters);
document.querySelector('#clear-filters')?.addEventListener('click', () => {
  form.reset();
  sortSelect.value = 'newest';
  applyFilters();
});

grid.innerHTML = skeletonCards(6);
const { data, error } = await supabase.from('listings_public').select('*').order('published_at',{ascending:false});
if (error) {
  console.error(error);
  grid.innerHTML = emptyListings('Listings are temporarily unavailable. Please contact us directly while we fix this.');
  countEl.textContent = 'Unable to load listings';
} else {
  allListings = data || [];
  applyFilters();
}
