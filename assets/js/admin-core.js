import { supabase } from './config.js';
import { toast } from './common.js';

export async function getAdminSession({ redirect = true } = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    if (redirect) location.href = '/admin';
    return null;
  }
  const { data: role, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (roleError || role?.role !== 'admin') {
    if (redirect) {
      await supabase.auth.signOut();
      location.href = '/admin?error=unauthorized';
    }
    return null;
  }
  return session;
}

export async function initAdminShell(active = '') {
  const session = await getAdminSession();
  if (!session) return null;
  document.querySelectorAll('.admin-nav a').forEach(a => {
    if (a.dataset.nav === active) a.classList.add('active');
  });
  const email = document.querySelector('[data-admin-email]');
  if (email) email.textContent = session.user.email || 'Admin';
  document.querySelectorAll('[data-signout]').forEach(btn => btn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = '/admin';
  }));
  return session;
}

export function confirmModal({title, message, confirmText='Confirm', danger=false}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop open';
    wrap.innerHTML = `<div class="modal"><h3>${title}</h3><p>${message}</p><div class="modal-actions"><button class="btn btn-outline" data-cancel>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmText}</button></div></div>`;
    document.body.appendChild(wrap);
    const done = (value) => { wrap.remove(); resolve(value); };
    wrap.querySelector('[data-cancel]').onclick = () => done(false);
    wrap.querySelector('[data-confirm]').onclick = () => done(true);
    wrap.addEventListener('click', e => { if (e.target === wrap) done(false); });
  });
}

export function adminSidebar() {
  return `<aside class="admin-sidebar"><a class="admin-logo" href="/admin/dashboard"><img src="/assets/img/lagos4rent-logo.svg" alt="Lagos4Rent"></a><nav class="admin-nav"><a href="/admin/dashboard" data-nav="dashboard">Overview</a><a href="/admin/listings" data-nav="listings">Listings</a><a href="/admin/enquiries" data-nav="enquiries">Enquiries</a><a href="/" target="_blank">View public site ↗</a></nav><div class="admin-sidebar-bottom"><button class="btn btn-outline btn-block btn-sm" data-signout>Sign out</button></div></aside>`;
}
