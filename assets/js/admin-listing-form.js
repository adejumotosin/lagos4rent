import { supabase } from './config.js';
import { confirmModal, initAdminShell } from './admin-core.js';
import { escapeHTML, money, setLoading, titleCase, toast } from './common.js';

const session = await initAdminShell('listings');
const params = new URLSearchParams(location.search);
let listingId = params.get('id');
let currentListing = null;
let mediaRows = [];
let amenities = [];
const form = document.querySelector('#listing-form');
const pageTitle = document.querySelector('#page-title');
const refLabel = document.querySelector('#reference-label');
const dropzone = document.querySelector('#dropzone');
const fileInput = document.querySelector('#media-input');
const mediaList = document.querySelector('#media-list');
const mediaHint = document.querySelector('#media-hint');
const amenityInput = document.querySelector('#amenity-input');
const amenityTags = document.querySelector('#amenity-tags');

function formField(name) { return form.elements.namedItem(name); }

function setValue(name, value) {
  const el = formField(name); if (!el) return;
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = value ?? '';
}

function renderAmenities() {
  amenityTags.innerHTML = amenities.map((a,i) => `<span class="tag">${escapeHTML(a)}<button type="button" data-remove-tag="${i}" aria-label="Remove ${escapeHTML(a)}">×</button></span>`).join('');
  amenityTags.querySelectorAll('[data-remove-tag]').forEach(btn => btn.addEventListener('click', () => { amenities.splice(Number(btn.dataset.removeTag),1); renderAmenities(); }));
}

amenityInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const value = amenityInput.value.trim().replace(/,$/,'');
    if (value && !amenities.some(x => x.toLowerCase() === value.toLowerCase())) amenities.push(value);
    amenityInput.value=''; renderAmenities();
  }
});
amenityInput?.addEventListener('blur', () => {
  const value = amenityInput.value.trim(); if (value && !amenities.some(x=>x.toLowerCase()===value.toLowerCase())) { amenities.push(value); amenityInput.value=''; renderAmenities(); }
});

function listingPayload(publishStatus) {
  const num = (name) => { const v=formField(name).value.trim(); return v === '' ? null : Number(v); };
  const purpose = formField('purpose').value;
  return {
    title: formField('title').value.trim(),
    purpose,
    property_type: formField('property_type').value.trim(),
    price: Number(formField('price').value || 0),
    rent_frequency: purpose === 'rent' ? (formField('rent_frequency').value || null) : null,
    location: formField('location').value.trim() || 'Lagos',
    neighbourhood: formField('neighbourhood').value.trim(),
    full_address: formField('full_address').value.trim() || null,
    bedrooms: num('bedrooms'), bathrooms: num('bathrooms'), toilets: num('toilets'), parking_spaces: num('parking_spaces'), size_sqm: num('size_sqm'),
    furnished: formField('furnished').checked, serviced: formField('serviced').checked,
    description: formField('description').value.trim(), amenities,
    featured: formField('featured').checked,
    availability_status: formField('availability_status').value,
    publish_status: publishStatus,
  };
}

function validate(payload, publishStatus) {
  if (!payload.title) return 'Title is required.';
  if (!payload.property_type) return 'Property type is required.';
  if (!payload.neighbourhood) return 'Neighbourhood is required.';
  if (!Number.isFinite(payload.price) || payload.price < 0) return 'Enter a valid price.';
  if (publishStatus === 'published' && !payload.description) return 'Add a property description before publishing.';
  return '';
}

async function saveListing(publishStatus, button) {
  const payload = listingPayload(publishStatus);
  const errorText = validate(payload,publishStatus);
  if (errorText) { toast(errorText,'error'); return null; }
  setLoading(button,true,publishStatus==='published'?'Publishing…':'Saving…');
  let result;
  if (listingId) {
    result = await supabase.from('listings').update(payload).eq('id',listingId).select('*').single();
  } else {
    result = await supabase.from('listings').insert({...payload, created_by: session.user.id}).select('*').single();
  }
  setLoading(button,false);
  if (result.error) { console.error(result.error); toast(result.error.message,'error'); return null; }
  currentListing = result.data;
  listingId = currentListing.id;
  history.replaceState({},'',`/admin/listing?id=${encodeURIComponent(listingId)}`);
  pageTitle.textContent = currentListing.title;
  refLabel.textContent = currentListing.reference_code;
  mediaHint.textContent = 'Upload images and videos, then choose a cover image.';
  dropzone.classList.remove('disabled');
  toast(publishStatus==='published'?'Listing published.':'Draft saved.','success');
  return currentListing;
}

document.querySelector('#save-draft')?.addEventListener('click', () => saveListing('draft',document.querySelector('#save-draft')));
document.querySelector('#publish-listing')?.addEventListener('click', () => saveListing('published',document.querySelector('#publish-listing')));
form?.addEventListener('submit', e => e.preventDefault());

async function loadListing() {
  if (!listingId) {
    pageTitle.textContent = 'Add new listing'; refLabel.textContent = 'Reference generated on first save';
    mediaHint.textContent = 'Save the listing first, then upload photos and videos.';
    return;
  }
  const { data, error } = await supabase.from('listings').select('*').eq('id',listingId).single();
  if (error || !data) { toast('Could not load this listing.','error'); location.href='/admin/listings'; return; }
  currentListing = data;
  pageTitle.textContent = data.title; refLabel.textContent = data.reference_code;
  for (const key of ['title','purpose','property_type','price','rent_frequency','location','neighbourhood','full_address','bedrooms','bathrooms','toilets','parking_spaces','size_sqm','description','availability_status']) setValue(key,data[key]);
  for (const key of ['furnished','serviced','featured']) setValue(key,data[key]);
  amenities = Array.isArray(data.amenities) ? data.amenities : []; renderAmenities();
  toggleRentFrequency();
  await loadMedia();
}

function toggleRentFrequency() {
  const rentField = document.querySelector('#rent-frequency-field');
  rentField.classList.toggle('hidden', formField('purpose').value !== 'rent');
}
formField('purpose')?.addEventListener('change',toggleRentFrequency);

async function loadMedia() {
  if (!listingId) { mediaList.innerHTML=''; return; }
  const { data, error } = await supabase.from('listing_media').select('*').eq('listing_id',listingId).order('sort_order',{ascending:true});
  if (error) { console.error(error); mediaList.innerHTML='<p>Could not load media.</p>'; return; }
  mediaRows = data || []; renderMedia();
}

function renderMedia() {
  if (!mediaRows.length) { mediaList.innerHTML = `<div style="grid-column:1/-1;color:#6b778a;font-size:12px">No media uploaded yet.</div>`; return; }
  mediaList.innerHTML = mediaRows.map((m,i) => `<div class="media-item" data-media="${m.id}"><div class="media-preview">${m.media_type==='video'?`<video src="${escapeHTML(m.public_url)}" muted preload="metadata"></video>`:`<img src="${escapeHTML(m.public_url)}" alt="${escapeHTML(m.alt_text || currentListing?.title || '')}">`}${m.is_cover?'<span class="cover-flag">Cover</span>':''}</div><div style="padding:8px 8px 0"><input data-alt="${m.id}" value="${escapeHTML(m.alt_text || '')}" placeholder="Alt text" style="width:100%;border:1px solid #e5e9ef;border-radius:7px;padding:6px;font-size:10px"></div><div class="media-actions"><button class="btn btn-outline btn-sm" data-cover="${m.id}">${m.is_cover?'Cover':'Set cover'}</button><button class="btn btn-ghost btn-sm" data-up="${m.id}" ${i===0?'disabled':''}>↑</button><button class="btn btn-ghost btn-sm" data-down="${m.id}" ${i===mediaRows.length-1?'disabled':''}>↓</button><button class="btn btn-danger btn-sm" data-delete-media="${m.id}">Delete</button></div></div>`).join('');
  mediaList.querySelectorAll('[data-cover]').forEach(btn => btn.addEventListener('click',()=>setCover(btn.dataset.cover)));
  mediaList.querySelectorAll('[data-delete-media]').forEach(btn => btn.addEventListener('click',()=>deleteMedia(btn.dataset.deleteMedia)));
  mediaList.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click',()=>moveMedia(btn.dataset.up,-1)));
  mediaList.querySelectorAll('[data-down]').forEach(btn => btn.addEventListener('click',()=>moveMedia(btn.dataset.down,1)));
  mediaList.querySelectorAll('[data-alt]').forEach(input => input.addEventListener('change',async()=>{
    const { error }=await supabase.from('listing_media').update({alt_text:input.value.trim()||null}).eq('id',input.dataset.alt);
    if(error) toast(error.message,'error'); else { const m=mediaRows.find(x=>x.id===input.dataset.alt); if(m)m.alt_text=input.value.trim(); }
  }));
}

async function setCover(id) {
  const { error: e1 } = await supabase.from('listing_media').update({is_cover:false}).eq('listing_id',listingId);
  if (e1) return toast(e1.message,'error');
  const { error: e2 } = await supabase.from('listing_media').update({is_cover:true}).eq('id',id);
  if (e2) return toast(e2.message,'error');
  mediaRows.forEach(m => m.is_cover = m.id === id); renderMedia(); toast('Cover image updated.','success');
}

async function moveMedia(id, delta) {
  const idx = mediaRows.findIndex(m=>m.id===id); const swap = idx+delta;
  if(idx<0||swap<0||swap>=mediaRows.length)return;
  const a=mediaRows[idx], b=mediaRows[swap];
  const aOrder=a.sort_order, bOrder=b.sort_order;
  const first = await supabase.from('listing_media').update({sort_order:bOrder}).eq('id',a.id);
  if(first.error)return toast(first.error.message,'error');
  const second = await supabase.from('listing_media').update({sort_order:aOrder}).eq('id',b.id);
  if(second.error)return toast(second.error.message,'error');
  a.sort_order=bOrder; b.sort_order=aOrder; mediaRows.sort((x,y)=>x.sort_order-y.sort_order); renderMedia();
}

async function deleteMedia(id) {
  const m=mediaRows.find(x=>x.id===id); if(!m)return;
  const ok=await confirmModal({title:'Delete media?',message:'This photo or video will be permanently removed from the listing.',confirmText:'Delete media',danger:true}); if(!ok)return;
  const storage=await supabase.storage.from('listing-media').remove([m.storage_path]);
  if(storage.error)return toast(storage.error.message,'error');
  const db=await supabase.from('listing_media').delete().eq('id',id);
  if(db.error)return toast(db.error.message,'error');
  mediaRows=mediaRows.filter(x=>x.id!==id);
  if(m.is_cover && mediaRows.length) await setCover(mediaRows[0].id); else renderMedia();
  toast('Media deleted.','success');
}

function sanitizeFileName(name) { return name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/-+/g,'-'); }

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const max = 2400; const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d'); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.88));
  if(!blob)return file;
  const base=file.name.replace(/\.[^.]+$/,'');
  return new File([blob],`${base}.webp`,{type:'image/webp',lastModified:Date.now()});
}

async function uploadFiles(files) {
  if(!listingId)return toast('Save the listing before uploading media.','error');
  const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm'];
  for(const original of files) {
    if(!allowed.includes(original.type)){toast(`${original.name}: unsupported file type.`,'error');continue;}
    if(original.size>100*1024*1024){toast(`${original.name}: file exceeds 100 MB.`,'error');continue;}
    const status=document.createElement('div'); status.className='card'; status.style.cssText='padding:10px;margin-top:8px;font-size:11px'; status.textContent=`Preparing ${original.name}…`; document.querySelector('#upload-status').appendChild(status);
    try {
      const file=original.type.startsWith('image/')?await compressImage(original):original;
      const path=`listings/${listingId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      status.textContent=`Uploading ${original.name}…`;
      const up=await supabase.storage.from('listing-media').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
      if(up.error)throw up.error;
      const { data:urlData }=supabase.storage.from('listing-media').getPublicUrl(path);
      const isFirst=mediaRows.length===0;
      const insert=await supabase.from('listing_media').insert({listing_id:listingId,storage_path:path,public_url:urlData.publicUrl,media_type:file.type.startsWith('video/')?'video':'image',mime_type:file.type,is_cover:isFirst,sort_order:mediaRows.length?Math.max(...mediaRows.map(x=>x.sort_order))+1:0,alt_text:currentListing?.title||null}).select('*').single();
      if(insert.error){await supabase.storage.from('listing-media').remove([path]);throw insert.error;}
      mediaRows.push(insert.data); status.textContent=`Uploaded ${original.name}`; status.style.color='#16784a';
    } catch(err){console.error(err);status.textContent=`Failed: ${original.name} — ${err.message||'upload error'}`;status.style.color='#b42318';}
  }
  renderMedia(); setTimeout(()=>document.querySelector('#upload-status').replaceChildren(),4500);
}

['dragenter','dragover'].forEach(ev=>dropzone?.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropzone?.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone?.addEventListener('drop',e=>uploadFiles([...e.dataTransfer.files]));
dropzone?.addEventListener('click',()=>{if(!listingId)return toast('Save the listing before uploading media.','error');fileInput.click()});
fileInput?.addEventListener('change',()=>{uploadFiles([...fileInput.files]);fileInput.value=''});

if(session) await loadListing();
