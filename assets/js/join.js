import { supabase } from './config.js';
import { setLoading } from './common.js?v=marketplace-20260824';

const form = document.querySelector('#auth-form');
const loginBtn = document.querySelector('#show-login');
const signupBtn = document.querySelector('#show-signup');
const nameField = document.querySelector('#name-field');
const signupOptions = document.querySelector('#signup-options');
const authSwitch = document.querySelector('.auth-switch');
const title = document.querySelector('#auth-title');
const sub = document.querySelector('#auth-sub');
const submit = document.querySelector('#auth-submit');
const message = document.querySelector('#auth-message');
const hint = document.querySelector('#password-hint');

const params = new URLSearchParams(location.search);
const intent = params.get('intent');
const hasSignupIntent = intent === 'post' || intent === 'agent';
const requestedNext = params.get('next');
const intentDefault = intent === 'post' ? '/dashboard#post' : intent === 'agent' ? '/dashboard#profile' : '/dashboard';
const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : intentDefault;

let mode = hasSignupIntent ? 'signup' : 'login';
let accountType = intent === 'agent' ? 'agent' : 'renter';

function selectAccountType(type) {
  accountType = type;
  document.querySelectorAll('[data-type]').forEach((button) => {
    button.classList.toggle('active', button.dataset.type === type);
  });
}

function render() {
  const signingUp = mode === 'signup';
  loginBtn?.classList.toggle('active', !signingUp);
  signupBtn?.classList.toggle('active', signingUp);
  nameField?.classList.toggle('hidden', !signingUp);
  signupOptions?.classList.toggle('hidden', !signingUp);
  if (title) title.textContent = signingUp ? 'Create your Lagos4Rent account' : 'Welcome back';
  if (sub) {
    sub.textContent = signingUp
      ? accountType === 'agent'
        ? 'Create an agent profile. Verification is reviewed separately after signup.'
        : 'Create a renter account to save homes, connect and post Tenant Direct listings.'
      : 'Sign in to continue your rental journey.';
  }
  if (submit) submit.textContent = signingUp ? 'Create account' : 'Sign in';
  if (hint) hint.textContent = signingUp ? 'Use at least 8 characters.' : '';
  if (form?.password) form.password.autocomplete = signingUp ? 'new-password' : 'current-password';
}

loginBtn?.addEventListener('click', () => {
  mode = 'login';
  render();
});

signupBtn?.addEventListener('click', () => {
  mode = 'signup';
  render();
});

document.querySelectorAll('[data-type]').forEach((button) => {
  button.addEventListener('click', () => {
    selectAccountType(button.dataset.type);
    render();
  });
});

selectAccountType(accountType);
render();

const { data: { session } } = await supabase.auth.getSession();

if (session && !hasSignupIntent) {
  location.replace(next);
} else if (session && hasSignupIntent) {
  const roleLabel = accountType === 'agent' ? 'agent' : 'renter';
  const continueHref = intent === 'post' ? '/dashboard#post' : '/dashboard#profile';
  const createLabel = accountType === 'agent' ? 'Sign out & create agent account' : 'Sign out & create renter account';

  if (authSwitch) authSwitch.classList.add('hidden');
  if (signupOptions) signupOptions.classList.add('hidden');
  if (form) form.classList.add('hidden');
  if (title) title.textContent = 'You are already signed in';
  if (sub) sub.textContent = `This browser is currently signed in as ${session.user.email || 'an existing Lagos4Rent user'}. You can continue with this account, or sign out to register a separate ${roleLabel} account.`;
  if (message) {
    message.innerHTML = `
      <div style="display:grid;gap:10px;margin-top:10px">
        <a class="btn btn-primary btn-block" href="${continueHref}">Continue with current account</a>
        <button class="btn btn-outline btn-block" type="button" id="signup-fresh-account">${createLabel}</button>
      </div>`;
    document.querySelector('#signup-fresh-account')?.addEventListener('click', async () => {
      const button = document.querySelector('#signup-fresh-account');
      setLoading(button, true, 'Signing out…');
      await supabase.auth.signOut();
      location.reload();
    });
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (session && hasSignupIntent) return;

  if (message) message.textContent = '';
  const fd = new FormData(form);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');

  setLoading(submit, true, mode === 'signup' ? 'Creating account…' : 'Signing in…');

  if (mode === 'signup') {
    const fullName = String(fd.get('full_name') || '').trim();
    if (fullName.length < 2) {
      if (message) message.textContent = 'Please enter your full name.';
      setLoading(submit, false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}${next}`,
        data: { full_name: fullName, account_type: accountType },
      },
    });

    setLoading(submit, false);
    if (error) {
      if (message) message.textContent = error.message;
      return;
    }

    if (data.session) {
      location.href = next;
    } else if (message) {
      message.innerHTML = '<strong>Check your email.</strong> Open the Lagos4Rent verification link and you will return to the correct part of your dashboard.';
    }
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setLoading(submit, false);
  if (error) {
    if (message) message.textContent = error.message;
    return;
  }
  location.href = next;
});
