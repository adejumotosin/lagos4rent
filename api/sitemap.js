const SUPABASE_URL = 'https://xpjdthhyfezdyhlzycin.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AhOJgBmlPzsduDMSUIwLSA_fZFv9Ofu';
const SITE_URL = 'https://lagos4rent.vercel.app';

async function supabaseRest(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Supabase REST ${response.status}`);
  return response.json();
}

const xmlEscape = (value = '') => String(value).replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));

export default async function handler(req, res) {
  const staticRoutes = ['/', '/listings', '/agents', '/safety', '/about', '/contact', '/join'];
  let listings = [];
  let agents = [];

  try {
    [listings, agents] = await Promise.all([
      supabaseRest('marketplace_listings?select=slug,updated_at&order=updated_at.desc&limit=1000'),
      supabaseRest('agent_profiles_public?select=user_id,verified_at&verification_status=eq.verified&limit=1000'),
    ]);
  } catch (error) {
    console.error(error);
  }

  const entries = [
    ...staticRoutes.map((route) => ({ loc: `${SITE_URL}${route}`, lastmod: null })),
    ...(listings || []).map((listing) => ({
      loc: `${SITE_URL}/listings/${encodeURIComponent(listing.slug)}`,
      lastmod: listing.updated_at || null,
    })),
    ...(agents || []).map((agent) => ({
      loc: `${SITE_URL}/agents/${encodeURIComponent(agent.user_id)}`,
      lastmod: agent.verified_at || null,
    })),
  ];

  const body = entries
    .map((entry) => `<url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(new Date(entry.lastmod).toISOString())}</lastmod>` : ''}</url>`)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
  res.status(200);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400');
  res.send(xml);
}
