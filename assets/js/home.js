import { supabase } from './config.js';
import { buildQuery, emptyListings, propertyCard, skeletonCards, toast } from './common.js';

const grid = document.querySelector('#featured-grid');
if (grid) {
  grid.innerHTML = skeletonCards(3);
  const { data, error } = await supabase
    .from('listings_public')
    .select('*')
    .eq('featured', true)
    .order('published_at', { ascending: false })
    .limit(6);
  if (error) {
    console.error(error);
    grid.innerHTML = emptyListings('Featured properties are temporarily unavailable. You can still tell us what you are looking for.');
  } else if (!data?.length) {
    grid.innerHTML = emptyListings('We are preparing our current inventory. Tell us your preferred area and budget and we will assist directly.');
  } else {
    grid.innerHTML = data.map(propertyCard).join('');
  }
}

const searchForm = document.querySelector('#home-search');
searchForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(searchForm);
  const query = buildQuery(Object.fromEntries(fd.entries()));
  location.href = `/listings${query ? `?${query}` : ''}`;
});

document.querySelectorAll('[data-area]').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    location.href = `/listings?neighbourhood=${encodeURIComponent(a.dataset.area)}`;
  });
});
