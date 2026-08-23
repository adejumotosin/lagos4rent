import { supabase } from './config.js';
import { escapeHTML, listingWhatsApp, money, propertyCard, titleCase, toast, setLoading } from './common.js';

const segments = location.pathname.split('/').filter(Boolean);
const slug = segments[0] === 'listings' && segments.length > 1 ? decodeURIComponent(segments.slice(1).join('/')) : new URLSearchParams(location.search).get('slug');
const root = document.querySelector('#property-root');
let listing = null;
let media = [];
let lightIndex = 0;

function notFound() {
  root.innerHTML = `<div class="container"><div class="empty-state" style="margin:60px 0"><div class="icon">⌂</div><h3>Property not found</h3><p>This listing may have been removed, unpublished or the link may be incorrect.</p><a class="btn btn-primary" href="/listings">Browse current listings</a></div></div>`;
  document.title = 'Property not found | Lagos4Rent';
}

function mediaCell(item, cls='') {
  if (!item) return `<div class="gallery-cell ${cls}"><div class="property-placeholder"><img src="/assets/img/lagos4rent-logo.svg" alt=""></div></div>`;
  const content = item.media_type === 'video'
    ? `<video src="${escapeHTML(item.public_url)}" muted playsinline preload="metadata"></video>`
    : `<img src="${escapeHTML(item.public_url)}" alt="${escapeHTML(item.alt_text || listing.title)}">`;
  return `<div class="gallery-cell ${cls}" data-media-id="${escapeHTML(item.id)}">${content}</div>`;
}

function renderGallery() {
  const gallery = document.querySelector('#media-gallery');
  const ordered = [...media].sort((a,b) => Number(b.is_cover)-Number(a.is_cover) || Number(a.sort_order)-Number(b.sort_order));
  gallery.innerHTML = `${mediaCell(ordered[0], 'gallery-main')}${mediaCell(ordered[1])}${mediaCell(ordered[2])}${ordered.length > 3 ? `<button class="gallery-more" id="gallery-more">View all ${ordered.length}</button>` : ''}`;
  gallery.querySelectorAll('[data-media-id]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.mediaId;
    lightIndex = ordered.findIndex(m => m.id === id);
    openLightbox(ordered);
  }));
  document.querySelector('#gallery-more')?.addEventListener('click', () => { lightIndex = 0; openLightbox(ordered); });
}

function openLightbox(ordered = media) {
  if (!ordered.length) return;
  const box = document.querySelector('#lightbox');
  box.dataset.order = JSON.stringify(ordered.map(x => x.id));
  renderLightbox(ordered);
  box.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderLightbox(ordered) {
  const item = ordered[lightIndex];
  if (!item) return;
  document.querySelector('#lightbox-media').innerHTML = item.media_type === 'video'
    ? `<video src="${escapeHTML(item.public_url)}" controls autoplay playsinline></video>`
    : `<img src="${escapeHTML(item.public_url)}" alt="${escapeHTML(item.alt_text || listing.title)}">`;
}

function closeLightbox() {
  const box = document.querySelector('#lightbox');
  box.classList.remove('open');
  document.querySelector('#lightbox-media').innerHTML = '';
  document.body.style.overflow = '';
}

document.querySelector('#lightbox-close')?.addEventListener('click', closeLightbox);
document.querySelector('#lightbox')?.addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
document.querySelector('#lightbox-prev')?.addEventListener('click', () => {
  const order = JSON.parse(document.querySelector('#lightbox').dataset.order || '[]');
  const ordered = order.map(id => media.find(m => m.id === id)).filter(Boolean);
  lightIndex = (lightIndex - 1 + ordered.length) % ordered.length; renderLightbox(ordered);
});
document.querySelector('#lightbox-next')?.addEventListener('click', () => {
  const order = JSON.parse(document.querySelector('#lightbox').dataset.order || '[]');
  const ordered = order.map(id => media.find(m => m.id === id)).filter(Boolean);
  lightIndex = (lightIndex + 1) % ordered.length; renderLightbox(ordered);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

if (!slug) notFound();
else {
  const { data, error } = await supabase.from('listings_public').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) {
    console.error(error);
    notFound();
  } else {
    listing = data;
    const mediaResult = await supabase.from('listing_media').select('*').eq('listing_id', listing.id).order('sort_order', {ascending:true});
    media = mediaResult.data || [];

    document.title = `${listing.title} | Lagos4Rent Real Estate`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${listing.title} in ${listing.neighbourhood || listing.location}. ${money(listing.price)}. View details and enquire with Lagos4Rent.`);

    const wa = listingWhatsApp(listing);
    const freq = listing.purpose === 'rent' && listing.rent_frequency ? titleCase(listing.rent_frequency) : '';
    const facts = [
      ['Beds', listing.bedrooms], ['Baths', listing.bathrooms], ['Toilets', listing.toilets], ['Parking', listing.parking_spaces], ['Size', listing.size_sqm ? `${Number(listing.size_sqm).toLocaleString()} sqm` : null]
    ].filter(([,v]) => v !== null && v !== undefined && v !== '');
    const amenities = Array.isArray(listing.amenities) ? listing.amenities : [];
    const statusClass = listing.availability_status === 'available' ? 'success' : listing.availability_status === 'reserved' ? 'warning' : 'danger';

    root.innerHTML = `<div class="container detail-wrap">
      <div class="breadcrumbs"><a href="/">Home</a> / <a href="/listings">Listings</a> / ${escapeHTML(listing.reference_code)}</div>
      <div class="detail-head"><div><div class="badges" style="position:static;margin-bottom:12px"><span class="badge">${escapeHTML(titleCase(listing.purpose))}</span><span class="badge ${statusClass}">${escapeHTML(titleCase(listing.availability_status))}</span>${listing.featured ? '<span class="badge orange">Featured</span>' : ''}</div><h1>${escapeHTML(listing.title)}</h1><div class="detail-sub">${escapeHTML(listing.neighbourhood)}, ${escapeHTML(listing.location)} · ${escapeHTML(listing.reference_code)}</div></div><div class="detail-price">${money(listing.price)}${freq ? `<small>per ${escapeHTML(freq.toLowerCase())}</small>` : ''}</div></div>
      <div class="media-gallery" id="media-gallery"></div>
      <div class="detail-grid"><div>
        ${facts.length ? `<div class="fact-grid">${facts.map(([l,v]) => `<div class="fact"><strong>${escapeHTML(v)}</strong><span>${escapeHTML(l)}</span></div>`).join('')}</div>` : ''}
        <section class="detail-section"><h3>About this property</h3><p>${escapeHTML(listing.description || 'Contact Lagos4Rent for more information about this property.')}</p></section>
        <section class="detail-section"><h3>Property details</h3><div class="amenity-list"><div class="amenity">Property type: ${escapeHTML(listing.property_type)}</div><div class="amenity">Purpose: ${escapeHTML(titleCase(listing.purpose))}</div><div class="amenity">Furnished: ${listing.furnished ? 'Yes' : 'No'}</div><div class="amenity">Serviced: ${listing.serviced ? 'Yes' : 'No'}</div></div></section>
        ${amenities.length ? `<section class="detail-section"><h3>Amenities</h3><div class="amenity-list">${amenities.map(a => `<div class="amenity">✓ ${escapeHTML(a)}</div>`).join('')}</div></section>` : ''}
        <section class="detail-section"><button class="btn btn-outline" id="share-btn">Share property</button></section>
        <section class="detail-section"><h3>Related listings</h3><div class="property-grid" id="related-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"></div></section>
      </div><aside class="card inquiry-card"><h3>Interested in this property?</h3><p>Send the reference directly on WhatsApp, or leave your details below.</p><a class="btn btn-orange btn-block" href="${wa}" target="_blank" rel="noopener">Enquire on WhatsApp</a><div style="height:15px"></div><form id="property-enquiry"><div class="field"><label>Name *</label><input name="name" required></div><div class="field"><label>Phone *</label><input name="phone" required inputmode="tel"></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field"><label>Message *</label><textarea name="message" required>I am interested in ${escapeHTML(listing.title)} (${escapeHTML(listing.reference_code)}).</textarea></div><button class="btn btn-primary btn-block" type="submit">Send enquiry</button></form></aside></div>
    </div><div class="mobile-whatsapp"><a class="btn btn-orange btn-block" href="${wa}" target="_blank" rel="noopener">WhatsApp about ${escapeHTML(listing.reference_code)}</a></div>`;
    renderGallery();

    document.querySelector('#share-btn')?.addEventListener('click', async () => {
      const shareData = { title: listing.title, text: `${listing.title} — ${money(listing.price)}`, url: location.href };
      try {
        if (navigator.share) await navigator.share(shareData);
        else { await navigator.clipboard.writeText(location.href); toast('Property link copied.', 'success'); }
      } catch (e) { if (e?.name !== 'AbortError') toast('Could not share this link.', 'error'); }
    });

    const enquiryForm = document.querySelector('#property-enquiry');
    enquiryForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = enquiryForm.querySelector('button[type="submit"]');
      setLoading(btn, true, 'Sending…');
      const fd = new FormData(enquiryForm);
      const payload = { listing_id: listing.id, property_reference: listing.reference_code, name: fd.get('name')?.trim(), phone: fd.get('phone')?.trim(), email: fd.get('email')?.trim() || null, message: fd.get('message')?.trim() };
      const { error } = await supabase.from('enquiries').insert(payload);
      setLoading(btn, false);
      if (error) { console.error(error); toast('We could not send your enquiry. Please use WhatsApp instead.', 'error'); }
      else { toast('Enquiry sent. Lagos4Rent will follow up.', 'success'); enquiryForm.reset(); }
    });

    const rel = await supabase.from('listings_public').select('*').neq('id', listing.id).limit(12);
    const candidates = (rel.data || []).filter(x => x.neighbourhood === listing.neighbourhood || x.property_type === listing.property_type).slice(0,4);
    const relatedGrid = document.querySelector('#related-grid');
    relatedGrid.innerHTML = candidates.length ? candidates.map(propertyCard).join('') : `<p style="grid-column:1/-1;color:#6b778a">No related published listings yet.</p>`;

    const jsonLd = {
      '@context': 'https://schema.org', '@type': 'RealEstateListing', name: listing.title,
      description: listing.description || undefined, url: location.href,
      offers: { '@type': 'Offer', priceCurrency: 'NGN', price: Number(listing.price), availability: listing.availability_status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability' },
      address: { '@type': 'PostalAddress', addressLocality: listing.neighbourhood, addressRegion: 'Lagos', addressCountry: 'NG' }
    };
    const script = document.createElement('script'); script.type = 'application/ld+json'; script.textContent = JSON.stringify(jsonLd); document.head.appendChild(script);
  }
}
