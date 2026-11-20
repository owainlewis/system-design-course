# Deploy to Cloudflare Pages

The site is static. `npm run build` writes it to `dist/`, and Cloudflare Pages serves that folder at https://systems-design.aiengineer.co.

## How it deploys

`.github/workflows/deploy.yml` runs on every push to `main`. It runs the tests, builds `dist/`, and uploads it to the Pages project with `wrangler pages deploy`. This works with a Pages project that was created by direct upload, so the project does not need Cloudflare's Git integration. You can also run it by hand from the Actions tab (Run workflow).

Until the secrets below are set, the workflow skips the deploy and leaves a warning on the run.

## One-time setup (Owain)

Add these in the repo under Settings → Secrets and variables → Actions:

| Name | Kind | Value |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | An API token with the **Cloudflare Pages: Edit** permission for your account. Create it at https://dash.cloudflare.com/profile/api-tokens (Create Custom Token). |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Your account ID. It is in the dashboard URL (`dash.cloudflare.com/<account id>/...`) and on the Workers & Pages overview. |
| `CLOUDFLARE_PAGES_PROJECT` | Variable | The Pages project's name, as shown under Workers & Pages. Leave it unset if the project is called `system-design-course`. |

Then run the workflow once from the Actions tab to deploy the current `main`.

## Notes

- `dist/_headers` is part of the build. Asset URLs carry a content hash, so `/assets/*` is cached for a year and a new build is never served stale.
- Pull requests do not deploy. CI (`ci.yml`) runs the tests and the build on each one.
