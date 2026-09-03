const SUPABASE_URL = 'https://xpjdthhyfezdyhlzycin.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AhOJgBmlPzsduDMSUIwLSA_fZFv9Ofu';
const SITE_URL = 'https://lagos4rent.vercel.app';

const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const money = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value || 0));

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

function pageShell({ title, description, canonical, image, jsonLd = null, notFound = false }) {
  const safeTitle = escapeHTML(title);
  const safeDescription = escapeHTML(description);
  const safeCanonical = escapeHTML(canonical);
  const safeImage = escapeHTML(image);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="description" content="${safeDescription}"><link rel="canonical" href="${safeCanonical}"><meta property="og:type" content="website"><meta property="og:site_name" content="Lagos4Rent"><meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}"><meta property="og:url" content="${safeCanonical}"><meta property="og:image" content="${safeImage}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${safeTitle}"><meta name="twitter:description" content="${safeDescription}"><meta name="twitter:image" content="${safeImage}"><meta name="theme-color" content="#002A65">${notFound ? '<meta name="robots" content="noindex">' : ''}<link rel="icon" href="/assets/img/lagos4rent-official.svg"><link rel="stylesheet" href="/assets/css/styles.css"><link rel="stylesheet" href="/assets/css/marketplace.css">${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}</head><body><header class="site-header market-nav"><div class="container nav-wrap"><a class="brand" href="/"><img src="/assets/img/lagos4rent-official.svg" alt="Lagos4Rent"></a><nav class="nav-links"><a href="/listings">Browse homes</a><a href="/agents">Agents</a><a href="/listings?source_type=tenant_direct">Tenant Direct</a><a href="/safety">Safety</a></nav><div class="nav-actions"><a class="btn btn-outline" data-account-link href="/join">Sign in</a><button class="mobile-toggle" data-mobile-toggle aria-label="Open menu">☰</button></div></div><nav class="mobile-menu" data-mobile-menu><a href="/listings">Browse homes</a><a href="/agents">Agents</a><a href="/safety">Safety</a><a data-account-link href="/join">Sign in</a></nav></header><main id="property-root"><div class="container" style="padding:55px 0"><div class="skeleton" style="height:42px;width:65%;margin-bottom:14px"></div><div class="skeleton" style="height:500px"></div></div></main><footer class="site-footer"><div class="container"><div class="footer-bottom"><span>Lagos4Rent</span><span>Trust before transaction.</span></div></div></footer><script type="module" src="/assets/js/property.js?v=marketplace-20260903"></script></body></html>`;
}

export default async function handler(req, res) {
  const rawSlug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  const slug = String(rawSlug || '').trim().slice(0, 180);
  if (!slug) {
    res.status(404).setHeader('Cache-Control', 'public, max-age=0, s-maxage=60').send(pageShell({
      title: 'Property not found | Lagos4Rent',
      description: 'This Lagos4Rent property could not be found.',
      canonical: `${SITE_URL}/listings`,
      image: `${SITE_URL}/assets/img/lagos4rent-official.svg`,
      notFound: true,
    }));
    return;
  }

  try {
    const rows = await supabaseRest(`marketplace_listings?select=title,slug,reference_code,neighbourhood,location,price,rent_frequency,cover_url,description,bedrooms,bathrooms,source_type,verification_status,agent_verification_status&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    const listing = rows?.[0];
    if (!listing) {
      res.status(404).setHeader('Cache-Control', 'public, max-age=0, s-maxage=60').send(pageShell({
        title: 'Property not found | Lagos4Rent',
        description: 'This property may have been removed or is no longer public.',
        canonical: `${SITE_URL}/listings/${encodeURIComponent(slug)}`,
        image: `${SITE_URL}/assets/img/lagos4rent-official.svg`,
        notFound: true,
      }));
      return;
    }

    const location = [listing.neighbourhood, listing.location].filter(Boolean).join(', ');
    const rentLabel = `${money(listing.price)}${listing.rent_frequency ? ` per ${listing.rent_frequency}` : ''}`;
    const description = String(listing.description || `${listing.title} in ${location}. ${rentLabel}. See transparent move-in costs and Lagos4Rent trust signals.`).replace(/\s+/g, ' ').trim().slice(0, 155);
    const canonical = `${SITE_URL}/listings/${encodeURIComponent(listing.slug)}`;
    const image = listing.cover_url || `${SITE_URL}/assets/img/lagos4rent-official.svg`;
    const title = `${listing.title} | Lagos4Rent`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Residence',
      name: listing.title,
      description,
      url: canonical,
      image: image ? [image] : undefined,
      address: {
        '@type': 'PostalAddress',
        addressLocality: listing.neighbourhood || listing.location || 'Lagos',
        addressRegion: 'Lagos',
        addressCountry: 'NG',
      },
    };

    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    res.send(pageShell({ title, description, canonical, image, jsonLd }));
  } catch (error) {
    console.error(error);
    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
    res.send(pageShell({
      title: 'Property | Lagos4Rent',
      description: 'View property details, transparent fees and trust signals on Lagos4Rent.',
      canonical: `${SITE_URL}/listings/${encodeURIComponent(slug)}`,
      image: `${SITE_URL}/assets/img/lagos4rent-official.svg`,
    }));
  }
}
