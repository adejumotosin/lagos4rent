# Lagos4Rent Real Estate

Production-ready website and admin CMS for Lagos4Rent.

## Live deployment

- Public website: https://lagos4rent.vercel.app
- Admin: https://lagos4rent.vercel.app/admin

## Features

- Premium public real estate website
- Searchable rental and sale listings
- Individual property pages with photo/video galleries
- WhatsApp-first property enquiries
- Secure Supabase-backed admin area
- Listing creation and editing
- Multiple image/video uploads, cover media and ordering
- Featured, draft, published and availability states
- Enquiry inbox
- Responsive UI
- Nigerian naira formatting
- SEO metadata, sitemap and robots rules

## Backend

The application uses the dedicated `lagos4rent` Supabase project. Client access uses a publishable key. Database and Storage access are protected through Row Level Security.

## Admin

Open `/admin` on the deployed site. When no administrator exists, the first authenticated user can claim the initial administrator role. After that, the first-admin claim is permanently disabled for other users.

## Deployment

The source is maintained in this repository and the production site is deployed on Vercel.
