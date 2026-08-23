import { supabase } from './config.js';
import { setLoading, toast } from './common.js';

const form = document.querySelector('#contact-form');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const fd = new FormData(form);
  const payload = {
    listing_id: null,
    property_reference: null,
    name: fd.get('name')?.trim(),
    phone: fd.get('phone')?.trim(),
    email: fd.get('email')?.trim() || null,
    message: fd.get('message')?.trim(),
  };
  if (!payload.name || !payload.phone || !payload.message) return toast('Please complete your name, phone and message.', 'error');
  setLoading(button, true, 'Sending…');
  const { error } = await supabase.from('enquiries').insert(payload);
  setLoading(button, false);
  if (error) { console.error(error); toast('We could not send your message. Please use WhatsApp instead.', 'error'); }
  else { toast('Message sent. Lagos4Rent will follow up.', 'success'); form.reset(); }
});
