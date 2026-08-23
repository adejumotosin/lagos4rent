import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://xpjdthhyfezdyhlzycin.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AhOJgBmlPzsduDMSUIwLSA_fZFv9Ofu';
export const WHATSAPP_NUMBER = '2349137088563';
export const INSTAGRAM_URL = 'https://www.instagram.com/lagosforrent/';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
