import { supabase } from './config.js';
import { initAdminShell } from './admin-core.js';
import { dateFmt, escapeHTML, money, titleCase } from './common.js';

const session = await initAdminShell('dashboard');
if (session) {
  const [listingsRes, enquiriesRes] = await Promise.all([
    supabase.from('listings').select('id,title,reference_code,neighbourhood,price,publish_status,availability_status,updated_at').order('updated_at',{ascending:false}),
    supabase.from('enquiries').select('id,property_reference,name,phone,status,created_at').order('created_at',{ascending:false})
  ]);
  const listings = listingsRes.data || [];
  const enquiries = enquiriesRes.data || [];
  const stats = {
    total: listings.length,
    published: listings.filter(x => x.publish_status === 'published').length,
    drafts: listings.filter(x => x.publish_status === 'draft').length,
    inactive: listings.filter(x => ['unavailable','let','sold','reserved'].includes(x.availability_status)).length,
    newEnquiries: enquiries.filter(x => x.status === 'new').length,
  };
  for (const [key,val] of Object.entries(stats)) {
    const el = document.querySelector(`[data-stat="${key}"]`); if (el) el.textContent = val;
  }
  const listingsBody = document.querySelector('#recent-listings');
  listingsBody.innerHTML = listings.length ? listings.slice(0,6).map(x => `<tr><td><div class="table-title">${escapeHTML(x.title)}</div><div class="table-sub">${escapeHTML(x.reference_code)}</div></td><td>${escapeHTML(x.neighbourhood)}</td><td>${money(x.price)}</td><td><span class="badge">${escapeHTML(titleCase(x.publish_status))}</span></td><td>${dateFmt(x.updated_at)}</td><td><a class="btn btn-outline btn-sm" href="/admin/listing?id=${encodeURIComponent(x.id)}">Edit</a></td></tr>`).join('') : `<tr><td colspan="6">No listings yet.</td></tr>`;
  const enquiriesBody = document.querySelector('#recent-enquiries');
  enquiriesBody.innerHTML = enquiries.length ? enquiries.slice(0,6).map(x => `<tr><td><div class="table-title">${escapeHTML(x.name)}</div><div class="table-sub">${escapeHTML(x.phone)}</div></td><td>${escapeHTML(x.property_reference || 'General')}</td><td><span class="badge ${x.status === 'new' ? 'orange' : ''}">${escapeHTML(titleCase(x.status))}</span></td><td>${dateFmt(x.created_at)}</td><td><a class="btn btn-outline btn-sm" href="/admin/enquiries">Open</a></td></tr>`).join('') : `<tr><td colspan="5">No enquiries yet.</td></tr>`;
}
