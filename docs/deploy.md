# Deploy

The site is static. `npm run build` writes it to `dist/`, and a Cloudflare Worker called `system-design-course` serves that folder as static assets at https://systems-design.aiengineer.co. `wrangler.jsonc` holds the Worker's config.

## How it deploys

`.github/workflows/deploy.yml` runs on every push to `main`. It runs the tests, builds `dist/`, and uploads it with `wrangler deploy`. You can also run it by hand from the Actions tab (Run workflow).

Until the secrets below are set, the workflow skips the deploy and leaves a warning on the run.

To deploy from a laptop instead: `npm test && npm run build && npx wrangler deploy`.

## One-time setup (Owain)

Add these in the repo under Settings → Secrets and variables → Actions:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | An API token from https://dash.cloudflare.com/profile/api-tokens. The "Edit Cloudflare Workers" template has the permissions it needs. |
| `CLOUDFLARE_ACCOUNT_ID` | `80f336a39f4eb1a4a1cea68cce661cdc` |

## Notes

- `dist/_headers` is part of the build. Asset URLs carry a content hash, so `/assets/*` is cached for a year and a new build is never served stale.
- Pull requests do not deploy. CI (`ci.yml`) runs the tests and the build on each one.
