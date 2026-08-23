import { supabase } from './config.js';
import { initAdminShell } from './admin-core.js';
import { dateTimeFmt, escapeHTML, titleCase, toast, waLink } from './common.js';

const session = await initAdminShell('enquiries');
const body = document.querySelector('#enquiries-body');
const search = document.querySelector('#enquiry-search');
const statusFilter = document.querySelector('#enquiry-status');
let enquiries = [];

function render() {
  const q = search.value.trim().toLowerCase();
  const s = statusFilter.value;
  let rows = enquiries.filter(x => !q || `${x.name} ${x.phone} ${x.email || ''} ${x.property_reference || ''} ${x.message}`.toLowerCase().includes(q));
  if(s) rows = rows.filter(x=>x.status===s);
  document.querySelector('#enquiry-count').textContent = `${rows.length} ${rows.length===1?'enquiry':'enquiries'}`;
  body.innerHTML = rows.length ? rows.map(x=>`<tr><td><div class="table-title">${escapeHTML(x.name)}</div><div class="table-sub">${escapeHTML(x.phone)}${x.email?` · ${escapeHTML(x.email)}`:''}</div></td><td>${escapeHTML(x.property_reference || 'General enquiry')}</td><td>${escapeHTML((x.message||'').slice(0,90))}${(x.message||'').length>90?'…':''}</td><td><span class="badge ${x.status==='new'?'orange':''}">${escapeHTML(titleCase(x.status))}</span></td><td>${dateTimeFmt(x.created_at)}</td><td><button class="btn btn-outline btn-sm" data-open="${x.id}">Open</button></td></tr>`).join('') : `<tr><td colspan="6"><div style="padding:30px;text-align:center;color:#6b778a">No enquiries match these filters.</div></td></tr>`;
  body.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openDetail(btn.dataset.open)));
}

async function refresh() {
  const { data, error } = await supabase.from('enquiries').select('*').order('created_at',{ascending:false});
  if(error){console.error(error);body.innerHTML='<tr><td colspan="6">Could not load enquiries.</td></tr>';return;}
  enquiries=data||[];render();
}

function openDetail(id) {
  const x=enquiries.find(v=>v.id===id);if(!x)return;
  const wrap=document.createElement('div');wrap.className='modal-backdrop open';
  const wa=waLink(`Hello ${x.name}, this is Lagos4Rent${x.property_reference?` regarding your enquiry about ${x.property_reference}`:''}.`);
  wrap.innerHTML=`<div class="modal"><div style="display:flex;justify-content:space-between;gap:20px"><div><h3>${escapeHTML(x.name)}</h3><p>${escapeHTML(x.property_reference || 'General property enquiry')}</p></div><button class="btn btn-ghost btn-sm" data-close>×</button></div><div class="enquiry-message">${escapeHTML(x.message)}</div><div style="display:grid;gap:8px;margin-top:14px;font-size:13px"><div><strong>Phone:</strong> ${escapeHTML(x.phone)}</div>${x.email?`<div><strong>Email:</strong> ${escapeHTML(x.email)}</div>`:''}<div><strong>Received:</strong> ${dateTimeFmt(x.created_at)}</div></div><div class="field" style="margin-top:15px"><label>Status</label><select data-status><option value="new" ${x.status==='new'?'selected':''}>New</option><option value="contacted" ${x.status==='contacted'?'selected':''}>Contacted</option><option value="closed" ${x.status==='closed'?'selected':''}>Closed</option></select></div><div class="modal-actions"><a class="btn btn-orange" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn-outline" href="tel:${escapeHTML(x.phone)}">Call</a>${x.email?`<a class="btn btn-outline" href="mailto:${escapeHTML(x.email)}">Email</a>`:''}<button class="btn btn-primary" data-save>Save status</button></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();wrap.querySelector('[data-close]').onclick=close;wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('[data-save]').onclick=async()=>{
    const status=wrap.querySelector('[data-status]').value;
    const { error }=await supabase.from('enquiries').update({status}).eq('id',x.id);
    if(error)return toast(error.message,'error');
    x.status=status;toast('Enquiry status updated.','success');close();render();
  };
}

search?.addEventListener('input',render);statusFilter?.addEventListener('change',render);
if(session)await refresh();
