import { supabase } from './config.js';
import { setLoading, toast } from './common.js';

const title = document.querySelector('#auth-title');
const intro = document.querySelector('#auth-intro');
const setupFields = document.querySelector('#setup-fields');
const form = document.querySelector('#auth-form');
const submit = document.querySelector('#auth-submit');
const message = document.querySelector('#auth-message');
let mode = 'login';

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle();
  if (role?.role === 'admin') location.href = '/admin/dashboard';
}

const { data: adminState, error: adminCheckError } = await supabase.from('app_config').select('has_admin').eq('id', 1).maybeSingle();
const hasAdmin = adminState?.has_admin === true;
if (adminCheckError) {
  console.error(adminCheckError);
  message.classList.remove('hidden');
  message.textContent = 'Could not check admin status. Please refresh.';
} else if (!hasAdmin) {
  mode = 'setup';
  title.textContent = 'Create the first admin';
  intro.textContent = 'Set up the private Lagos4Rent dashboard. This option disappears after the first admin is claimed.';
  setupFields.classList.remove('hidden');
  submit.textContent = 'Create admin account';
} else {
  mode = 'login';
  title.textContent = 'Admin sign in';
  intro.textContent = 'Sign in to manage Lagos4Rent listings, media and enquiries.';
  setupFields.classList.add('hidden');
  submit.textContent = 'Sign in';
}

if (new URLSearchParams(location.search).get('error') === 'unauthorized') {
  message.classList.remove('hidden');
  message.textContent = 'That account does not have administrator access.';
}

async function claimIfFirst() {
  const { data: state, error: stateError } = await supabase.from('app_config').select('has_admin').eq('id', 1).maybeSingle();
  if (stateError) throw stateError;
  if (state?.has_admin) return false;
  const { data, error } = await supabase.rpc('claim_first_admin');
  if (error) throw error;
  return data === true;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const fullName = String(fd.get('full_name') || '').trim();
  if (!email || !password) return toast('Enter your email and password.', 'error');
  setLoading(submit, true, mode === 'setup' ? 'Creating account…' : 'Signing in…');
  message.classList.add('hidden');
  try {
    if (mode === 'setup') {
      if (!fullName) throw new Error('Enter your name.');
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: 'https://lagos4rent.vercel.app/admin'
        }
      });
      if (error) throw error;
      if (data.session) {
        const claimed = await claimIfFirst();
        if (!claimed) throw new Error('An admin account was already claimed. Please sign in with the admin account.');
        location.href = '/admin/dashboard';
      } else {
        message.classList.remove('hidden');
        message.textContent = 'Account created. Check your email to verify the address, then return here and sign in. The first verified account to complete sign-in will claim the admin role.';
        mode = 'login-after-verify';
        setupFields.classList.add('hidden');
        title.textContent = 'Verify your email';
        intro.textContent = 'After verification, sign in below to complete admin setup.';
        submit.textContent = 'Sign in after verification';
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('Sign in did not complete.');
      await claimIfFirst();
      const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', data.session.user.id).maybeSingle();
      if (role?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('This account does not have administrator access.');
      }
      location.href = '/admin/dashboard';
    }
  } catch (err) {
    console.error(err);
    message.classList.remove('hidden');
    message.textContent = err.message || 'Authentication failed.';
  } finally {
    setLoading(submit, false);
  }
});
