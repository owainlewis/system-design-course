# Deploy to Cloudflare Pages

The site is static, so Cloudflare Pages serves `dist/` directly.

## One-time setup (Owain)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Pick `owainlewis/system-design-course`.
3. Build settings:
   - Production branch: `main`
   - Build command: `npm test && npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. Save and deploy. The first build gives a `*.pages.dev` address.
5. In the project → Custom domains → add `system-design.aiengineer.co`. Because `aiengineer.co` is on Cloudflare, it creates the DNS record for you.

## After setup

- Every merge to `main` deploys to production.
- Every pull request gets its own preview URL, so a lesson can be checked before it goes live.
- `dist/_redirects` sends `/` to the first lesson until the course has a home page.
- `dist/_headers` caches files under `/assets/` for a year. Asset URLs carry a content hash, so a new build is never served stale.
