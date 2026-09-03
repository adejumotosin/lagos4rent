import { supabase } from './config.js';
import {
  currentSession,
  escapeHTML,
  money,
  propertyCard,
  setLoading,
  titleCase,
  toast,
} from './common.js?v=marketplace-20260903';

const session = await currentSession();
if (!session) {
  location.replace('/join?next=/dashboard');
  throw new Error('auth required');
}

const uid = session.user.id;
const postForm = document.querySelector('#post-form');
const draftKey = `lagos4rent:post-draft:${uid}`;
let profile = null;
let agentProfile = null;
let myListings = [];
let connections = [];
let saved = [];
let activeConnectionId = null;
let autosaveTimer = null;

const userEl = document.querySelector('#dash-user');
if (userEl) userEl.textContent = session.user.email || '';
document.querySelector('#signout').onclick = async () => {
  await supabase.auth.signOut();
  location.href = '/';
};

function setBadge(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = String(value);
  element.classList.toggle('hidden', !value);
}

function serialisePostDraft() {
  const values = {};
  const data = new FormData(postForm);
  for (const [key, value] of data.entries()) {
    if (key === 'media' || value instanceof File) continue;
    values[key] = value;
  }
  values.landlord_contact_confirmed = postForm.landlord_contact_confirmed?.checked ? 'on' : '';
  return { values, savedAt: new Date().toISOString() };
}

function savePostDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify(serialisePostDraft()));
    const note = document.querySelector('#autosave-note');
    if (note) note.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    console.warn('Could not autosave listing draft', error);
  }
}

function schedulePostDraftSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(savePostDraft, 450);
}

function clearPostDraft({ resetForm = false } = {}) {
  localStorage.removeItem(draftKey);
  document.querySelector('#draft-status')?.classList.add('hidden');
  if (resetForm) {
    postForm.reset();
    if (profile?.account_type !== 'agent') {
      postForm.agency_fee.value = '0';
      postForm.agency_fee.disabled = true;
    }
    costs();
  }
  const note = document.querySelector('#autosave-note');
  if (note) note.textContent = 'Changes save automatically on this device.';
}

function restorePostDraft() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
  } catch {
    localStorage.removeItem(draftKey);
    return;
  }
  if (!draft?.values) return;

  for (const [name, value] of Object.entries(draft.values)) {
    const field = postForm.elements.namedItem(name);
    if (!field || name === 'media') continue;
    if (field.type === 'checkbox') field.checked = value === 'on' || value === true;
    else field.value = value;
  }

  if (profile?.account_type !== 'agent') {
    postForm.agency_fee.value = '0';
    postForm.agency_fee.disabled = true;
  }

  const status = document.querySelector('#draft-status');
  const statusText = document.querySelector('#draft-status-text');
  status?.classList.remove('hidden');
  if (statusText && draft.savedAt) statusText.textContent = `Draft restored from ${new Date(draft.savedAt).toLocaleString()}.`;
  costs();
}

async function loadProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) {
    console.error(error);
    toast('Could not load your profile.', 'error');
    return;
  }

  profile = data || { account_type: 'renter' };
  document.querySelector('#account-label').textContent = profile.account_type === 'agent' ? 'Agent account' : 'Renter account';
  document.querySelector('#profile-form').full_name.value = profile.full_name || '';
  document.querySelector('#profile-form').phone.value = profile.phone || '';
  document.querySelector('#profile-form').bio.value = profile.bio || '';
  document.querySelector('#tenant-confirm-wrap').classList.toggle('hidden', profile.account_type === 'agent');

  if (profile.account_type === 'agent') {
    document.querySelector('#agent-profile-box').classList.remove('hidden');
    document.querySelector('#become-agent-box').classList.add('hidden');
    document.querySelector('#post-title').textContent = 'Submit an agent listing';
    postForm.agency_fee.disabled = false;

    const { data: agent } = await supabase.from('agent_profiles').select('*').eq('user_id', uid).maybeSingle();
    agentProfile = agent || null;
    const agentForm = document.querySelector('#agent-form');
    if (agentProfile) {
      agentForm.agency_name.value = agentProfile.agency_name || '';
      agentForm.public_phone.value = agentProfile.public_phone || '';
      agentForm.whatsapp_phone.value = agentProfile.whatsapp_phone || '';
      agentForm.years_experience.value = agentProfile.years_experience ?? '';
      agentForm.areas_served.value = (agentProfile.areas_served || []).join(', ');
      agentForm.bio.value = agentProfile.bio || '';
      document.querySelector('#stat-trust').textContent = titleCase(agentProfile.verification_status);
    }
  } else {
    document.querySelector('#agent-profile-box').classList.add('hidden');
    document.querySelector('#become-agent-box').classList.remove('hidden');
    document.querySelector('#post-title').textContent = 'Post your apartment with Tenant Direct';
    document.querySelector('#post-note').textContent = 'Tell future renters about the apartment you are leaving. We review every submission before it becomes public. Tenant Direct does not mean you have authority to grant a tenancy.';
    postForm.agency_fee.value = '0';
    postForm.agency_fee.disabled = true;
    document.querySelector('#stat-trust').textContent = profile.is_identity_verified ? 'Verified' : 'Standard';
  }
}

async function loadListings() {
  const { data, error } = await supabase
    .from('listings')
    .select('id,title,reference_code,neighbourhood,price,publish_status,availability_status,moderation_note,created_at')
    .eq('created_by', uid)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  myListings = data || [];
  document.querySelector('#stat-listings').textContent = myListings.length;
  const wrap = document.querySelector('#my-listings');
  if (!myListings.length) {
    wrap.innerHTML = '<p style="color:var(--muted)">You have not submitted any homes yet.</p>';
    return;
  }

  const ids = myListings.map((item) => item.id);
  const { data: media } = await supabase
    .from('listing_media')
    .select('listing_id,public_url,is_cover,sort_order')
    .in('listing_id', ids)
    .order('is_cover', { ascending: false });

  const cover = new Map();
  (media || []).forEach((item) => {
    if (!cover.has(item.listing_id)) cover.set(item.listing_id, item.public_url);
  });

  wrap.innerHTML = myListings
    .map((item) => `<div class="listing-row"><img class="listing-thumb" src="${escapeHTML(cover.get(item.id) || '/assets/img/lagos4rent-official.svg')}" alt=""><div><strong>${escapeHTML(item.title)}</strong><div style="font-size:11px;color:var(--muted)">${escapeHTML(item.reference_code)} · ${escapeHTML(item.neighbourhood)} · ${money(item.price)}</div>${item.moderation_note ? `<div class="moderation-note">${escapeHTML(item.moderation_note)}</div>` : ''}</div><div><span class="status-dot ${item.publish_status}">${titleCase(item.publish_status)}</span><div style="font-size:10px;color:var(--muted);margin-top:5px">${titleCase(item.availability_status)}</div></div></div>`)
    .join('');
}

async function unreadMessagesByConnection() {
  const result = await supabase
    .from('messages')
    .select('id,connection_id')
    .neq('sender_id', uid)
    .is('read_at', null);

  if (result.error) {
    console.warn('Unread-message state is not available yet', result.error);
    return new Map();
  }

  const map = new Map();
  for (const message of result.data || []) map.set(message.connection_id, (map.get(message.connection_id) || 0) + 1);
  return map;
}

async function loadConnections() {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .or(`seeker_id.eq.${uid},lister_id.eq.${uid}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  connections = data || [];
  document.querySelector('#stat-connections').textContent = connections.length;

  const ids = [...new Set(connections.map((connection) => connection.listing_id))];
  const listingMap = new Map();
  if (ids.length) {
    const { data: publicListings } = await supabase
      .from('marketplace_listings')
      .select('id,title,reference_code')
      .in('id', ids);
    (publicListings || []).forEach((item) => listingMap.set(item.id, item));
  }

  const unreadMap = await unreadMessagesByConnection();
  const totalUnread = [...unreadMap.values()].reduce((sum, value) => sum + value, 0);
  setBadge('#message-badge', totalUnread);

  const wrap = document.querySelector('#connections-list');
  if (!connections.length) {
    wrap.innerHTML = '<p style="color:var(--muted)">No connection requests yet.</p>';
    return;
  }

  wrap.innerHTML = connections
    .map((connection) => {
      const item = listingMap.get(connection.listing_id);
      const incoming = connection.lister_id === uid;
      const name = item?.title || 'Property connection';
      const ref = item?.reference_code || connection.listing_id.slice(0, 8);
      const unread = unreadMap.get(connection.id) || 0;
      const actions = incoming
        ? `<button class="btn btn-outline btn-sm" data-status="accepted" data-id="${connection.id}">Accept</button><button class="btn btn-outline btn-sm" data-status="viewing" data-id="${connection.id}">Viewing</button><button class="btn btn-outline btn-sm" data-status="completed" data-id="${connection.id}" data-complete="lister">Complete</button><button class="btn btn-danger btn-sm" data-status="declined" data-id="${connection.id}">Decline</button>`
        : `<button class="btn btn-outline btn-sm" data-complete="seeker" data-id="${connection.id}">Mark completed</button><button class="btn btn-outline btn-sm" data-status="closed" data-id="${connection.id}">Close</button>`;

      return `<div class="connection-card ${unread ? 'has-unread' : ''}"><header><div><strong>${escapeHTML(name)}</strong><div style="font-size:11px;color:var(--muted)">${escapeHTML(ref)} · ${incoming ? 'Incoming request' : 'Your request'}</div></div><span class="status-dot ${connection.status === 'completed' ? 'published' : 'draft'}">${titleCase(connection.status)}</span></header><p>${escapeHTML(connection.message)}</p><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">${actions}<button class="btn btn-primary btn-sm" data-chat="${connection.id}">Messages${unread ? ` <span class="inline-unread">${unread}</span>` : ''}</button>${!incoming && connection.seeker_completed && connection.lister_completed ? `<button class="btn btn-orange btn-sm" data-review="${connection.id}" data-subject="${connection.lister_id}">Review</button>` : ''}</div></div>`;
    })
    .join('');

  wrap.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = () => updateConnection(button.dataset.id, {
      status: button.dataset.status,
      ...(button.dataset.complete === 'lister' ? { lister_completed: true } : {}),
    });
  });
  wrap.querySelectorAll('[data-complete="seeker"]').forEach((button) => {
    button.onclick = () => updateConnection(button.dataset.id, { seeker_completed: true });
  });
  wrap.querySelectorAll('[data-chat]').forEach((button) => {
    button.onclick = () => openChat(button.dataset.chat);
  });
  wrap.querySelectorAll('[data-review]').forEach((button) => {
    button.onclick = () => openReview(button.dataset.review, button.dataset.subject);
  });
}

async function updateConnection(id, patch) {
  const { error } = await supabase.from('connections').update(patch).eq('id', id);
  if (error) {
    console.error(error);
    toast('Could not update this connection.', 'error');
  } else {
    toast('Connection updated.', 'success');
    await loadConnections();
  }
}

async function markConnectionRead(id) {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('connection_id', id)
    .neq('sender_id', uid)
    .is('read_at', null);
  if (error) console.warn('Could not mark messages read yet', error);
}

async function openChat(id, { preservePosition = false } = {}) {
  activeConnectionId = id;
  const box = document.querySelector('#conversation-box');
  box.classList.remove('hidden');
  if (!preservePosition) box.innerHTML = '<p>Loading messages…</p>';

  await markConnectionRead(id);
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('connection_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    box.innerHTML = '<p style="color:var(--muted)">Messages could not be loaded.</p>';
    return;
  }

  box.innerHTML = `<div class="message-thread"><div class="message-list" id="message-list">${(data || []).map((message) => `<div class="message ${message.sender_id === uid ? 'mine' : ''}">${escapeHTML(message.body)}<small>${new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || '<p style="color:var(--muted);font-size:12px">No messages yet.</p>'}</div><form class="message-form" id="message-form"><input name="body" placeholder="Write a message…" maxlength="4000" required><button class="btn btn-primary btn-sm">Send</button></form></div>`;

  const list = document.querySelector('#message-list');
  if (list) list.scrollTop = list.scrollHeight;
  if (!preservePosition) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  document.querySelector('#message-form').onsubmit = async (event) => {
    event.preventDefault();
    const body = event.target.body.value.trim();
    if (!body) return;
    const { error: sendError } = await supabase.from('messages').insert({ connection_id: id, sender_id: uid, body });
    if (sendError) toast('Message failed.', 'error');
    else {
      event.target.reset();
      await openChat(id, { preservePosition: true });
    }
  };

  await loadConnections();
}

async function openReview(connectionId, subjectId) {
  const existing = await supabase.from('reviews').select('id').eq('connection_id', connectionId).maybeSingle();
  if (existing.data) return toast('You already reviewed this interaction.');

  const backdrop = document.createElement('div');
  backdrop.className = 'review-modal-backdrop';
  backdrop.innerHTML = `<div class="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><button class="review-close" type="button" aria-label="Close">×</button><span class="eyebrow">Verified interaction</span><h2 id="review-title">How was this rental interaction?</h2><p>Your review will be tied to this completed Lagos4Rent connection.</p><div class="review-star-picker" role="radiogroup" aria-label="Rating"><button type="button" data-rating="1" aria-label="1 star">★</button><button type="button" data-rating="2" aria-label="2 stars">★</button><button type="button" data-rating="3" aria-label="3 stars">★</button><button type="button" data-rating="4" aria-label="4 stars">★</button><button type="button" data-rating="5" aria-label="5 stars">★</button></div><div class="field"><label for="review-comment">Comment <span style="font-weight:400;color:var(--muted)">(optional)</span></label><textarea id="review-comment" maxlength="1000" placeholder="What should another renter know about this interaction?"></textarea></div><div class="review-actions"><button type="button" class="btn btn-outline" data-cancel>Cancel</button><button type="button" class="btn btn-primary" data-submit disabled>Publish review</button></div></div>`;
  document.body.appendChild(backdrop);

  let rating = 0;
  const stars = [...backdrop.querySelectorAll('[data-rating]')];
  const submitButton = backdrop.querySelector('[data-submit]');
  const close = () => backdrop.remove();

  function paintStars() {
    stars.forEach((star) => star.classList.toggle('selected', Number(star.dataset.rating) <= rating));
    submitButton.disabled = !rating;
  }

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      rating = Number(star.dataset.rating);
      paintStars();
    });
  });

  backdrop.querySelector('.review-close').onclick = close;
  backdrop.querySelector('[data-cancel]').onclick = close;
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  submitButton.onclick = async () => {
    const comment = backdrop.querySelector('#review-comment').value.trim() || null;
    setLoading(submitButton, true, 'Publishing…');
    const { error } = await supabase.from('reviews').insert({
      connection_id: connectionId,
      reviewer_id: uid,
      subject_user_id: subjectId,
      rating,
      comment,
    });
    setLoading(submitButton, false);
    if (error) {
      console.error(error);
      toast('Review could not be submitted.', 'error');
    } else {
      toast('Review published.', 'success');
      close();
      await loadConnections();
    }
  };
}

async function loadSaved() {
  const { data, error } = await supabase.from('saved_listings').select('listing_id').eq('user_id', uid);
  if (error) {
    console.error(error);
    return;
  }
  saved = data || [];
  document.querySelector('#stat-saved').textContent = saved.length;
  const grid = document.querySelector('#saved-grid');
  if (!saved.length) {
    grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1">No saved homes yet.</p>';
    return;
  }
  const { data: homes } = await supabase.from('marketplace_listings').select('*').in('id', saved.map((item) => item.listing_id));
  grid.innerHTML = (homes || []).map(propertyCard).join('') || '<p style="color:var(--muted);grid-column:1/-1">Your saved homes are no longer public.</p>';
}

function notificationIcon(kind) {
  return { message: '✉', connection: '↔', listing: '⌂', verification: '✓', safety: '!', system: '•' }[kind] || '•';
}

async function loadNotifications() {
  const result = await supabase
    .from('notifications')
    .select('id,kind,title,body,link,read_at,created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(30);

  const wrap = document.querySelector('#notifications-list');
  if (result.error) {
    console.warn('Notifications are not available yet', result.error);
    wrap.innerHTML = '<p style="color:var(--muted)">Notifications are being prepared. Connection messages still remain available below.</p>';
    setBadge('#notification-badge', 0);
    setBadge('#nav-notification-badge', 0);
    return;
  }

  const rows = result.data || [];
  const unread = rows.filter((item) => !item.read_at).length;
  setBadge('#notification-badge', unread);
  setBadge('#nav-notification-badge', unread);

  if (!rows.length) {
    wrap.innerHTML = '<p style="color:var(--muted)">No notifications yet.</p>';
    return;
  }

  wrap.innerHTML = rows.map((item) => `<button type="button" class="notification-item ${item.read_at ? '' : 'unread'}" data-notification="${item.id}" data-link="${escapeHTML(item.link || '')}"><span class="notification-icon">${notificationIcon(item.kind)}</span><span><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.body || '')}</span><small>${new Date(item.created_at).toLocaleString()}</small></span></button>`).join('');

  wrap.querySelectorAll('[data-notification]').forEach((button) => {
    button.addEventListener('click', async () => {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', button.dataset.notification);
      const link = button.dataset.link;
      await loadNotifications();
      if (link) location.href = link;
    });
  });
}

document.querySelector('#mark-notifications-read').addEventListener('click', async () => {
  const button = document.querySelector('#mark-notifications-read');
  setLoading(button, true, 'Marking…');
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', uid)
    .is('read_at', null);
  setLoading(button, false);
  if (error) toast('Could not update notifications.', 'error');
  else await loadNotifications();
});

function costs() {
  const values = ['price', 'agency_fee', 'legal_fee', 'caution_fee', 'service_charge', 'other_fees']
    .map((name) => Number(postForm.elements.namedItem(name)?.value || 0));
  document.querySelector('#cost-preview').textContent = money(values.reduce((sum, value) => sum + value, 0));
}

postForm.addEventListener('input', (event) => {
  if (event.target.name !== 'media') schedulePostDraftSave();
  costs();
});
postForm.addEventListener('change', (event) => {
  if (event.target.name !== 'media') schedulePostDraftSave();
  costs();
});

document.querySelector('#clear-post-draft').addEventListener('click', () => clearPostDraft({ resetForm: true }));

postForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.querySelector('#post-submit');
  const formData = new FormData(form);
  const numberValue = (name) => Number(formData.get(name) || 0);

  setLoading(button, true, 'Submitting…');
  const payload = {
    title: String(formData.get('title')).trim(),
    purpose: 'rent',
    property_type: formData.get('property_type'),
    price: numberValue('price'),
    rent_frequency: formData.get('rent_frequency') || 'year',
    location: 'Lagos',
    neighbourhood: String(formData.get('neighbourhood')).trim(),
    full_address: String(formData.get('full_address')).trim(),
    bedrooms: formData.get('bedrooms') ? numberValue('bedrooms') : null,
    bathrooms: formData.get('bathrooms') ? numberValue('bathrooms') : null,
    toilets: formData.get('toilets') ? numberValue('toilets') : null,
    description: String(formData.get('description')).trim(),
    amenities: String(formData.get('amenities') || '').split(',').map((item) => item.trim()).filter(Boolean),
    available_from: formData.get('available_from') || null,
    agency_fee: profile.account_type === 'agent' ? numberValue('agency_fee') : 0,
    legal_fee: numberValue('legal_fee'),
    caution_fee: numberValue('caution_fee'),
    service_charge: numberValue('service_charge'),
    other_fees: numberValue('other_fees'),
    other_fees_label: String(formData.get('other_fees_label') || '').trim() || null,
    source_type: profile.account_type === 'agent' ? 'agent' : 'tenant_direct',
    landlord_contact_confirmed: profile.account_type === 'agent' ? false : formData.get('landlord_contact_confirmed') === 'on',
    created_by: uid,
  };

  const { data: listing, error } = await supabase.from('listings').insert(payload).select('id,reference_code').single();
  if (error) {
    console.error(error);
    setLoading(button, false);
    toast('Could not submit listing. Check the required fields.', 'error');
    return;
  }

  const files = [...form.media.files].slice(0, 12);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (file.size > 20 * 1024 * 1024) {
      toast(`${file.name} is over the 20 MB beta upload limit.`, 'error');
      continue;
    }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${listing.id}/${crypto.randomUUID()}-${safe}`;
    const upload = await supabase.storage.from('listing-media').upload(path, file, { cacheControl: '3600' });
    if (upload.error) {
      console.error(upload.error);
      toast(`Could not upload ${file.name}.`, 'error');
      continue;
    }
    const { data: publicUrl } = supabase.storage.from('listing-media').getPublicUrl(path);
    await supabase.from('listing_media').insert({
      listing_id: listing.id,
      storage_path: path,
      public_url: publicUrl.publicUrl,
      media_type: file.type.startsWith('video/') ? 'video' : 'image',
      mime_type: file.type,
      is_cover: index === 0,
      sort_order: index,
    });
  }

  setLoading(button, false);
  toast(`Submitted ${listing.reference_code} for Lagos4Rent review.`, 'success');
  form.reset();
  if (profile.account_type !== 'agent') {
    form.agency_fee.value = '0';
    form.agency_fee.disabled = true;
  }
  clearPostDraft();
  costs();
  await loadListings();
});

document.querySelector('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const { error } = await supabase.from('profiles').update({
    full_name: String(data.get('full_name') || '').trim(),
    phone: String(data.get('phone') || '').trim() || null,
    bio: String(data.get('bio') || '').trim() || null,
  }).eq('id', uid);
  if (error) toast('Profile update failed.', 'error');
  else toast('Profile saved.', 'success');
});

document.querySelector('#become-agent').onclick = async () => {
  if (!confirm('Switch this account to an agent profile? You can still browse homes, but listings you submit will be identified as agent listings.')) return;
  const update = await supabase.from('profiles').update({ account_type: 'agent' }).eq('id', uid);
  if (update.error) return toast('Could not switch account.', 'error');
  const create = await supabase.from('agent_profiles').insert({ user_id: uid });
  if (create.error && create.error.code !== '23505') return toast('Could not create agent profile.', 'error');
  location.reload();
};

document.querySelector('#agent-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const payload = {
    agency_name: String(data.get('agency_name') || '').trim() || null,
    public_phone: String(data.get('public_phone') || '').trim() || null,
    whatsapp_phone: String(data.get('whatsapp_phone') || '').trim() || null,
    years_experience: data.get('years_experience') ? Number(data.get('years_experience')) : null,
    areas_served: String(data.get('areas_served') || '').split(',').map((item) => item.trim()).filter(Boolean),
    bio: String(data.get('bio') || '').trim() || null,
  };
  const { error } = await supabase.from('agent_profiles').update(payload).eq('user_id', uid);
  if (error) toast('Agent profile update failed.', 'error');
  else toast('Agent profile saved.', 'success');
});

document.querySelector('#verification-request').onclick = async () => {
  const { error } = await supabase.from('agent_profiles').update({ verification_status: 'pending' }).eq('user_id', uid);
  if (error) {
    console.error(error);
    toast('Could not request verification.', 'error');
  } else {
    toast('Verification request submitted. Lagos4Rent will review your profile and contact you if more evidence is needed.', 'success');
    document.querySelector('#stat-trust').textContent = 'Pending';
  }
};

function startRealtime() {
  supabase
    .channel(`lagos4rent-dashboard-${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, async () => {
      await loadNotifications();
      await loadConnections();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      if (payload.new?.connection_id === activeConnectionId) await openChat(activeConnectionId, { preservePosition: true });
      else await loadConnections();
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') console.warn('Realtime dashboard channel could not connect.');
    });
}

await loadProfile();
restorePostDraft();
await Promise.all([loadListings(), loadConnections(), loadSaved(), loadNotifications()]);
costs();
startRealtime();
