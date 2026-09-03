import { supabase } from './config.js';
import { emptyListings, propertyCard, skeletonCards, titleCase } from './common.js?v=marketplace-20260903';

const PAGE_SIZE = 12;
const grid = document.querySelector('#listings-grid');
const countEl = document.querySelector('#result-count');
const panel = document.querySelector('#filter-panel');
const form = document.querySelector('#filters-form');
const sort = document.querySelector('#sort');
const pagination = document.querySelector('#pagination');
const params = new URLSearchParams(location.search);

const filterNames = [
  'source_type',
  'trust',
  'neighbourhood',
  'property_type',
  'min_price',
  'max_price',
  'max_total',
  'bedrooms',
  'availability_status',
];

for (const name of filterNames) {
  const element = form?.elements.namedItem(name);
  if (element && params.has(name)) element.value = params.get(name);
}
if (sort) sort.value = params.get('sort') || 'newest';

const initialPage = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);

document.querySelector('#mobile-filter-btn')?.addEventListener('click', () => panel?.classList.toggle('open'));

function filters() {
  const values = Object.fromEntries(new FormData(form).entries());
  values.sort = sort?.value || 'newest';
  return values;
}

function syncUrl(values, page) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value && !(key === 'sort' && value === 'newest')) next.set(key, value);
  }
  if (page > 1) next.set('page', String(page));
  history.replaceState({}, '', `/listings${next.toString() ? `?${next}` : ''}`);
}

function renderChips(values) {
  const wrap = document.querySelector('#active-filters');
  if (!wrap) return;
  const labels = {
    source_type: 'Source',
    trust: 'Trust',
    neighbourhood: 'Area',
    property_type: 'Type',
    min_price: 'Min rent',
    max_price: 'Max rent',
    max_total: 'Max move-in',
    bedrooms: 'Bedrooms',
    availability_status: 'Status',
  };
  wrap.innerHTML = Object.entries(values)
    .filter(([key, value]) => key !== 'sort' && value)
    .map(([key, value]) => `<span class="filter-chip">${labels[key] || titleCase(key)}: ${titleCase(value)}</span>`)
    .join('');
}

function safeAreaSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[%,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function buildDatabaseQuery(values) {
  let query = supabase.from('marketplace_listings').select('*', { count: 'exact' });

  if (values.source_type) query = query.eq('source_type', values.source_type);
  if (values.trust === 'property_checked') query = query.eq('verification_status', 'property_checked');
  if (values.trust === 'verified_agent') query = query.eq('agent_verification_status', 'verified');

  const area = safeAreaSearch(values.neighbourhood);
  if (area) query = query.ilike('neighbourhood', `%${area}%`);

  if (values.property_type) query = query.eq('property_type', values.property_type);
  if (values.min_price) query = query.gte('price', Number(values.min_price));
  if (values.max_price) query = query.lte('price', Number(values.max_price));
  if (values.max_total) query = query.lte('total_move_in_cost', Number(values.max_total));
  if (values.bedrooms) query = query.gte('bedrooms', Number(values.bedrooms));
  if (values.availability_status) query = query.eq('availability_status', values.availability_status);

  if (values.sort === 'price-asc') query = query.order('price', { ascending: true });
  else if (values.sort === 'price-desc') query = query.order('price', { ascending: false });
  else if (values.sort === 'total-asc') query = query.order('total_move_in_cost', { ascending: true });
  else query = query.order('published_at', { ascending: false });

  return query;
}

function renderPagination(page, total) {
  if (!pagination) return;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const buttons = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);

  buttons.push(`<button class="btn btn-outline btn-sm" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button>`);
  if (start > 1) buttons.push('<span class="pagination-gap">…</span>');
  for (let value = start; value <= end; value += 1) {
    buttons.push(`<button class="pagination-page ${value === page ? 'active' : ''}" data-page="${value}" aria-current="${value === page ? 'page' : 'false'}">${value}</button>`);
  }
  if (end < pages) buttons.push('<span class="pagination-gap">…</span>');
  buttons.push(`<button class="btn btn-outline btn-sm" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next</button>`);

  pagination.innerHTML = buttons.join('');
  pagination.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = Number(button.dataset.page);
      if (target >= 1 && target <= pages && target !== page) loadListings(target, { scroll: true });
    });
  });
}

async function loadListings(page = 1, { scroll = false } = {}) {
  const values = filters();
  renderChips(values);
  grid.innerHTML = skeletonCards(6);
  countEl.textContent = 'Loading homes…';
  if (pagination) pagination.innerHTML = '';

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count, error } = await buildDatabaseQuery(values).range(from, to);

  if (error) {
    console.error(error);
    countEl.textContent = 'Unable to load homes';
    grid.innerHTML = emptyListings('Listings are temporarily unavailable.');
    return;
  }

  const total = count || 0;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > maxPage && total > 0) {
    await loadListings(maxPage, { scroll });
    return;
  }

  const rows = data || [];
  const firstShown = total ? from + 1 : 0;
  const lastShown = Math.min(from + rows.length, total);
  countEl.textContent = total
    ? `Showing ${firstShown}–${lastShown} of ${total} ${total === 1 ? 'home' : 'homes'}`
    : '0 homes';

  grid.innerHTML = rows.length
    ? rows.map(propertyCard).join('')
    : emptyListings('No homes match those filters yet. Try a wider search or create an account to post an apartment.');

  renderPagination(page, total);
  syncUrl(values, page);
  if (scroll) document.querySelector('.listings-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  panel?.classList.remove('open');
  loadListings(1);
});

sort?.addEventListener('change', () => loadListings(1));

document.querySelector('#clear-filters')?.addEventListener('click', () => {
  form.reset();
  sort.value = 'newest';
  loadListings(1);
});

window.addEventListener('popstate', () => location.reload());

await loadListings(initialPage);
