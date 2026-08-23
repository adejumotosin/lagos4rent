import { supabase } from './config.js';
import { confirmModal, initAdminShell } from './admin-core.js';
import { dateFmt, escapeHTML, money, titleCase, toast } from './common.js';

const session = await initAdminShell('listings');
const body = document.querySelector('#listings-body');
const search = document.querySelector('#listing-search');
const publishFilter = document.querySelector('#publish-filter');
const statusFilter = document.querySelector('#status-filter');
let listings = [];
let media = [];

function coverFor(id) {
  const rows = media.filter(m => m.listing_id === id).sort((a,b) => Number(b.is_cover)-Number(a.is_cover) || Number(a.sort_order)-Number(b.sort_order));
  return rows[0]?.public_url || '';
}

function row(x) {
  const cover = coverFor(x.id);
  return `<tr data-row="${x.id}">
    <td><div style="display:flex;gap:10px;align-items:center"><div>${cover ? `<img class="table-thumb" src="${escapeHTML(cover)}" alt="">` : `<div class="table-thumb property-placeholder"></div>`}</div><div><div class="table-title">${escapeHTML(x.title)}</div><div class="table-sub">${escapeHTML(x.reference_code)} · ${escapeHTML(x.neighbourhood)}</div></div></div></td>
    <td>${money(x.price)}</td>
    <td><span class="badge">${escapeHTML(titleCase(x.publish_status))}</span></td>
    <td><select class="status-select" data-id="${x.id}" style="border:1px solid #e5e9ef;border-radius:8px;padding:7px"><option value="available" ${x.availability_status==='available'?'selected':''}>Available</option><option value="reserved" ${x.availability_status==='reserved'?'selected':''}>Reserved</option><option value="let" ${x.availability_status==='let'?'selected':''}>Let</option><option value="sold" ${x.availability_status==='sold'?'selected':''}>Sold</option><option value="unavailable" ${x.availability_status==='unavailable'?'selected':''}>Unavailable</option></select></td>
    <td>${x.featured ? '<span class="badge orange">Featured</span>' : '—'}</td>
    <td>${dateFmt(x.updated_at)}</td>
    <td><div class="action-row"><a class="btn btn-outline btn-sm" href="/admin/listing?id=${encodeURIComponent(x.id)}">Edit</a><button class="btn btn-ghost btn-sm" data-action="publish" data-id="${x.id}">${x.publish_status==='published'?'Unpublish':'Publish'}</button><button class="btn btn-ghost btn-sm" data-action="feature" data-id="${x.id}">${x.featured?'Unfeature':'Feature'}</button><button class="btn btn-danger btn-sm" data-action="delete" data-id="${x.id}">Delete</button></div></td>
  </tr>`;
}

function render() {
  const q = search.value.trim().toLowerCase();
  const p = publishFilter.value;
  const s = statusFilter.value;
  let rows = listings.filter(x => !q || `${x.title} ${x.reference_code} ${x.neighbourhood}`.toLowerCase().includes(q));
  if (p) rows = rows.filter(x => x.publish_status === p);
  if (s) rows = rows.filter(x => x.availability_status === s);
  body.innerHTML = rows.length ? rows.map(row).join('') : `<tr><td colspan="7"><div style="padding:30px;text-align:center;color:#6b778a">No listings match these filters.</div></td></tr>`;
  bindActions();
  document.querySelector('#listing-count').textContent = `${rows.length} ${rows.length===1?'listing':'listings'}`;
}

async function refresh() {
  const [l,m] = await Promise.all([
    supabase.from('listings').select('*').order('updated_at',{ascending:false}),
    supabase.from('listing_media').select('id,listing_id,public_url,is_cover,sort_order,storage_path')
  ]);
  if (l.error) { console.error(l.error); body.innerHTML = `<tr><td colspan="7">Could not load listings.</td></tr>`; return; }
  listings = l.data || []; media = m.data || []; render();
}

function bindActions() {
  body.querySelectorAll('.status-select').forEach(sel => sel.addEventListener('change', async () => {
    const { error } = await supabase.from('listings').update({availability_status:sel.value}).eq('id',sel.dataset.id);
    if (error) toast(error.message,'error'); else { toast('Availability updated.','success'); const x=listings.find(v=>v.id===sel.dataset.id); if(x)x.availability_status=sel.value; }
  }));
  body.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', async () => {
    const x = listings.find(v => v.id === btn.dataset.id); if (!x) return;
    if (btn.dataset.action === 'publish') {
      const next = x.publish_status === 'published' ? 'draft' : 'published';
      if (next === 'published' && (!x.title || !x.neighbourhood || !x.property_type || Number(x.price) < 0)) return toast('Complete the required property details before publishing.','error');
      const { error } = await supabase.from('listings').update({publish_status:next}).eq('id',x.id);
      if (error) toast(error.message,'error'); else { x.publish_status=next; toast(next==='published'?'Listing published.':'Listing moved to draft.','success'); render(); }
    }
    if (btn.dataset.action === 'feature') {
      const { error } = await supabase.from('listings').update({featured:!x.featured}).eq('id',x.id);
      if (error) toast(error.message,'error'); else { x.featured=!x.featured; toast(x.featured?'Listing featured.':'Listing unfeatured.','success'); render(); }
    }
    if (btn.dataset.action === 'delete') {
      const ok = await confirmModal({title:'Delete listing?',message:`${escapeHTML(x.title)} and its media records will be removed. This cannot be undone.`,confirmText:'Delete listing',danger:true});
      if (!ok) return;
      const related = media.filter(m => m.listing_id === x.id);
      if (related.length) {
        const { error: storageError } = await supabase.storage.from('listing-media').remove(related.map(m=>m.storage_path));
        if (storageError) console.warn('Storage cleanup warning', storageError);
      }
      const { error } = await supabase.from('listings').delete().eq('id',x.id);
      if (error) toast(error.message,'error'); else { toast('Listing deleted.','success'); await refresh(); }
    }
  }));
}

[search,publishFilter,statusFilter].forEach(el => el?.addEventListener(el===search?'input':'change',render));
if (session) await refresh();
