import { supabase } from './config.js';
import {
  currentSession,
  escapeHTML,
  money,
  setLoading,
  titleCase,
  toast,
  trustBadge,
} from './common.js?v=marketplace-20260903';

const root = document.querySelector('#property-root');
const parts = location.pathname.split('/').filter(Boolean);
const slug = parts[0] === 'listings' && parts[1]
  ? decodeURIComponent(parts.slice(1).join('/'))
  : new URLSearchParams(location.search).get('slug');

function missing() {
  root.innerHTML = '<div class="container"><div class="empty-state" style="margin:60px 0"><div class="icon">⌂</div><h3>Property not found</h3><p>This home may have been removed or is no longer public.</p><a class="btn btn-primary" href="/listings">Browse homes</a></div></div>';
}

function mediaMarkup(item, title, { thumb = false } = {}) {
  if (!item) return '<div class="property-placeholder"><img src="/assets/img/lagos4rent-official.svg" alt=""></div>';
  if (item.media_type === 'video') {
    return `<video src="${escapeHTML(item.public_url)}" ${thumb ? 'muted preload="metadata"' : 'controls playsinline preload="metadata"'}></video>`;
  }
  return `<img src="${escapeHTML(item.public_url)}" alt="${thumb ? '' : escapeHTML(title)}" ${thumb ? 'loading="lazy"' : ''}>`;
}

function setupGallery(media, title) {
  if (!media.length) return;
  const main = document.querySelector('#gallery-main-content');
  const lightbox = document.querySelector('#gallery-lightbox');
  const lightboxMedia = document.querySelector('#lightbox-media');
  const counter = document.querySelector('#gallery-counter');
  let index = 0;
  let touchStartX = null;

  function paint(targetIndex, { open = false } = {}) {
    index = (targetIndex + media.length) % media.length;
    main.innerHTML = mediaMarkup(media[index], title);
    counter.textContent = `${index + 1} / ${media.length}`;
    document.querySelectorAll('[data-gallery-index]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.galleryIndex) === index);
    });
    if (open || lightbox.classList.contains('open')) {
      lightboxMedia.innerHTML = mediaMarkup(media[index], title);
      lightbox.classList.add('open');
      document.body.classList.add('no-scroll');
    }
  }

  function close() {
    lightbox.classList.remove('open');
    lightboxMedia.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }

  main.addEventListener('click', (event) => {
    if (event.target.closest('video')) return;
    paint(index, { open: true });
  });
  document.querySelectorAll('[data-gallery-index]').forEach((button) => {
    button.addEventListener('click', () => paint(Number(button.dataset.galleryIndex)));
  });
  document.querySelector('#gallery-open')?.addEventListener('click', () => paint(index, { open: true }));
  document.querySelector('#gallery-prev')?.addEventListener('click', () => paint(index - 1, { open: true }));
  document.querySelector('#gallery-next')?.addEventListener('click', () => paint(index + 1, { open: true }));
  document.querySelector('#gallery-close')?.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });
  lightbox.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  lightbox.addEventListener('touchend', (event) => {
    if (touchStartX == null) return;
    const end = event.changedTouches[0]?.clientX ?? touchStartX;
    const delta = end - touchStartX;
    if (Math.abs(delta) > 45) paint(index + (delta < 0 ? 1 : -1), { open: true });
    touchStartX = null;
  }, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') paint(index - 1, { open: true });
    if (event.key === 'ArrowRight') paint(index + 1, { open: true });
  });

  paint(0);
}

if (!slug) {
  missing();
} else {
  const { data: listing, error } = await supabase.from('marketplace_listings').select('*').eq('slug', slug).maybeSingle();
  if (error || !listing) {
    console.error(error);
    missing();
  } else {
    const mediaResult = await supabase
      .from('listing_media')
      .select('*')
      .eq('listing_id', listing.id)
      .order('is_cover', { ascending: false })
      .order('sort_order', { ascending: true });
    const media = mediaResult.data || [];

    document.title = `${listing.title} | Lagos4Rent`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${listing.title} in ${listing.neighbourhood || listing.location}. See transparent move-in costs and Lagos4Rent trust signals.`);

    const listerName = listing.source_type === 'tenant_direct'
      ? 'Current tenant'
      : listing.agency_name || listing.lister_name || 'Property lister';
    const agentLink = listing.lister_account_type === 'agent' ? `/agents/${encodeURIComponent(listing.created_by)}` : '';
    const feeRows = [
      ['Rent', listing.price],
      ['Agency fee', listing.agency_fee],
      ['Legal fee', listing.legal_fee],
      ['Caution fee', listing.caution_fee],
      ['Service charge', listing.service_charge],
      [listing.other_fees_label || 'Other fees', listing.other_fees],
    ].filter(([, value]) => Number(value) > 0);
    const facts = [
      listing.bedrooms != null ? `${listing.bedrooms} bedrooms` : '',
      listing.bathrooms != null ? `${listing.bathrooms} bathrooms` : '',
      listing.toilets != null ? `${listing.toilets} toilets` : '',
      listing.parking_spaces != null ? `${listing.parking_spaces} parking` : '',
      listing.size_sqm ? `${Number(listing.size_sqm).toLocaleString()} sqm` : '',
    ].filter(Boolean);

    const thumbnails = media
      .map((item, index) => `<button type="button" class="media-thumb" data-gallery-index="${index}" aria-label="View media ${index + 1}">${mediaMarkup(item, listing.title, { thumb: true })}<span>${item.media_type === 'video' ? '▶' : ''}</span></button>`)
      .join('');

    root.innerHTML = `<div class="container" style="padding:40px 0 80px"><div class="breadcrumbs"><a href="/">Home</a> / <a href="/listings">Homes</a> / ${escapeHTML(listing.reference_code)}</div><div class="detail-head"><div>${trustBadge(listing)}<h1 style="margin-top:12px">${escapeHTML(listing.title)}</h1><div class="detail-sub">${escapeHTML(listing.neighbourhood)}, ${escapeHTML(listing.location)} · ${escapeHTML(listing.reference_code)}</div></div><div class="detail-price">${money(listing.price)}${listing.rent_frequency ? `<small>per ${escapeHTML(titleCase(listing.rent_frequency).toLowerCase())}</small>` : ''}</div></div><div class="property-layout-v2"><div class="property-main-v2"><div class="gallery-shell"><button type="button" class="gallery-main" id="gallery-main-content" aria-label="Open full-screen gallery">${mediaMarkup(media[0], listing.title)}</button>${media.length ? `<div class="gallery-toolbar"><button class="gallery-open" id="gallery-open" type="button">View full screen</button><span id="gallery-counter">1 / ${media.length}</span></div>` : ''}</div>${media.length > 1 ? `<div class="media-thumbs">${thumbnails}</div>` : ''}<div class="fact-grid" style="margin-top:24px">${facts.map((fact) => `<div class="fact"><strong>${escapeHTML(fact.split(' ')[0])}</strong><span>${escapeHTML(fact.split(' ').slice(1).join(' '))}</span></div>`).join('')}</div><section class="detail-section"><h3>About this home</h3><p>${escapeHTML(listing.description || 'No description supplied.')}</p></section>${listing.amenities?.length ? `<section class="detail-section"><h3>Amenities</h3><div class="amenity-list">${listing.amenities.map((amenity) => `<div class="amenity">✓ ${escapeHTML(amenity)}</div>`).join('')}</div></section>` : ''}${listing.source_type === 'tenant_direct' ? '<div class="tenant-disclaimer"><strong>Tenant Direct:</strong> This listing was submitted by a current renter who is moving out. Their post is an introduction only. Confirm the landlord or authorized property manager, final rent and tenancy terms before paying.</div>' : ''}<button class="btn btn-outline report-link" id="report-toggle">Report this listing</button><div id="report-box" class="hidden" style="margin-top:12px"><div class="dash-section"><div class="field"><label>Reason</label><select id="report-reason"><option value="suspected_scam">Suspected scam</option><option value="misleading_information">Misleading information</option><option value="unauthorized_listing">Unauthorized listing</option><option value="duplicate_listing">Duplicate listing</option><option value="fee_issue">Fee issue</option><option value="harassment">Harassment</option><option value="other">Other</option></select></div><div class="field" style="margin-top:10px"><label>Details</label><textarea id="report-details" placeholder="Tell us what happened"></textarea></div><button class="btn btn-danger" id="report-submit" style="margin-top:10px">Submit report</button></div></div></div><aside class="property-side-v2"><div class="fee-card"><span class="eyebrow">Transparent move-in cost</span>${feeRows.map(([name, value]) => `<div class="fee-row"><span>${escapeHTML(name)}</span><strong>${money(value)}</strong></div>`).join('')}<div class="fee-row total"><span>Total move-in</span><span>${money(listing.total_move_in_cost)}</span></div><small style="display:block;color:var(--muted);margin-top:10px">Always confirm final written terms before payment.</small></div><div class="lister-card"><div class="agent-top"><div class="avatar">${escapeHTML((listerName || 'L').charAt(0).toUpperCase())}</div><div><strong>${escapeHTML(listerName)}</strong><div>${listing.agent_verification_status === 'verified' ? '<span class="verified-mark">✓ Verified agent</span>' : listing.source_type === 'tenant_direct' ? '<span class="verified-mark" style="color:var(--tenant)">Tenant Direct</span>' : '<span style="font-size:11px;color:var(--muted)">Not verified</span>'}</div></div></div>${listing.agent_rating ? `<div class="agent-stats"><div class="agent-stat"><strong>${Number(listing.agent_rating).toFixed(1)}</strong><span>Rating</span></div><div class="agent-stat"><strong>${listing.agent_review_count || 0}</strong><span>Reviews</span></div><div class="agent-stat"><strong>${listing.agent_completed_connections || 0}</strong><span>Completed</span></div></div>` : ''}${agentLink ? `<a class="btn btn-outline btn-block" href="${agentLink}">View agent profile</a>` : ''}</div><div class="action-card"><h3 style="color:var(--navy);margin-bottom:8px">Connect through Lagos4Rent</h3><p style="font-size:13px;color:var(--muted);margin-bottom:14px">Your request is recorded on the platform before you exchange further details.</p><textarea id="connection-message" style="width:100%;min-height:95px;border:1px solid var(--line);border-radius:10px;padding:10px">Hi, I am interested in ${escapeHTML(listing.title)} (${escapeHTML(listing.reference_code)}). Is it still available?</textarea><button class="btn btn-primary btn-block" id="connect-btn" style="margin-top:10px">Request connection</button><button class="btn btn-outline btn-block" id="save-btn" style="margin-top:8px">Save home</button></div></aside></div></div>${media.length ? `<div class="gallery-lightbox" id="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Property media"><button class="gallery-lightbox-close" id="gallery-close" type="button" aria-label="Close gallery">×</button><button class="gallery-lightbox-nav prev" id="gallery-prev" type="button" aria-label="Previous media">‹</button><div class="gallery-lightbox-media" id="lightbox-media"></div><button class="gallery-lightbox-nav next" id="gallery-next" type="button" aria-label="Next media">›</button></div>` : ''}`;

    setupGallery(media, listing.title);

    const userSession = await currentSession();
    const connect = document.querySelector('#connect-btn');
    const save = document.querySelector('#save-btn');
    if (userSession?.user?.id === listing.created_by) {
      connect.textContent = 'This is your listing';
      connect.disabled = true;
    }

    connect?.addEventListener('click', async () => {
      if (!userSession) {
        location.href = `/join?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const message = document.querySelector('#connection-message').value.trim();
      if (!message) return toast('Add a short message first.', 'error');
      setLoading(connect, true, 'Sending…');
      const { error: connectionError } = await supabase.from('connections').insert({
        listing_id: listing.id,
        seeker_id: userSession.user.id,
        lister_id: listing.created_by,
        message,
      });
      setLoading(connect, false);
      if (connectionError) {
        if (connectionError.code === '23505') toast('You already requested a connection for this home.', 'error');
        else {
          console.error(connectionError);
          toast('Could not send request.', 'error');
        }
      } else {
        toast('Connection request sent. Track it in your dashboard.', 'success');
        connect.textContent = 'Request sent';
        connect.disabled = true;
      }
    });

    save?.addEventListener('click', async () => {
      if (!userSession) {
        location.href = `/join?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const { error: saveError } = await supabase.from('saved_listings').upsert({
        user_id: userSession.user.id,
        listing_id: listing.id,
      });
      if (saveError) toast('Could not save this home.', 'error');
      else {
        toast('Home saved.', 'success');
        save.textContent = 'Saved';
      }
    });

    document.querySelector('#report-toggle')?.addEventListener('click', () => document.querySelector('#report-box').classList.toggle('hidden'));
    document.querySelector('#report-submit')?.addEventListener('click', async () => {
      if (!userSession) {
        location.href = `/join?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      const details = document.querySelector('#report-details').value.trim();
      if (details.length < 5) return toast('Please add a little more detail.', 'error');
      const reason = document.querySelector('#report-reason').value;
      const { error: reportError } = await supabase.from('reports').insert({
        reporter_id: userSession.user.id,
        listing_id: listing.id,
        reported_user_id: listing.created_by,
        reason,
        details,
      });
      if (reportError) {
        console.error(reportError);
        toast('Could not submit report.', 'error');
      } else {
        toast('Report submitted for review.', 'success');
        document.querySelector('#report-box').classList.add('hidden');
      }
    });
  }
}
