# Deploying Sunroom to Cloudflare (private, with note sync)

Target setup: **Cloudflare Pages** hosts the app, **Workers KV** stores your
synced annotations, and **Cloudflare Access** locks the whole domain to
you@example.com. All on Cloudflare's free tier.

## One-time setup

### 1. You: create the account and log wrangler in

1. Sign up (free) at https://dash.cloudflare.com — no domain or credit card
   needed.
2. In this project folder run:

   ```bash
   npx wrangler login
   ```

   A browser window opens; approve the request.

### 2. Create the KV namespace and deploy

(Claude can run this part for you once wrangler is logged in.)

```bash
# create the storage namespace; prints an id
npx wrangler kv namespace create SUNROOM_KV

# paste that id into wrangler.toml, replacing REPLACE_WITH_KV_NAMESPACE_ID

# build + first deploy (~250 MB of images — the first upload takes a while)
npm run deploy
```

Wrangler prints your URL, e.g. `https://sunroom-xyz.pages.dev`.

Then bind the defense-in-depth email check (optional but recommended):
Dashboard → Workers & Pages → sunroom → Settings → Variables and Secrets →
add `ALLOWED_EMAIL = you@example.com` (Production), then redeploy
(`npm run deploy`).

### 3. You: put Cloudflare Access in front of it — REQUIRED

Until this step is done the site (and the sync API) is reachable by anyone
who has the URL. Do it right after the first deploy:

1. Dashboard → **Zero Trust** (one-time: pick any team name, Free plan).
2. **Access → Applications → Add an application → Self-hosted.**
3. Application name: `Sunroom`. Add two public hostnames:
   - your production domain, e.g. `sunroom-xyz.pages.dev`
   - the preview wildcard: subdomain `*`, domain `sunroom-xyz.pages.dev`
4. Add a policy: name `me only`, action **Allow**, include → **Emails** →
   `you@example.com`. Session duration: up to you (e.g. 1 month = you
   re-verify monthly per device).
5. Save. Optionally under Authentication, leave the default **One-time PIN**
   (emails you a code) and/or add Google as a login method.

Now visiting the site from any device shows Cloudflare's login screen first;
only your email gets in. The `/api/store` sync endpoint sits behind the same
wall, and with `ALLOWED_EMAIL` set it additionally verifies the identity
header Cloudflare attaches after login.

## Every update after that

```bash
npm run deploy
```

(If bookmarks changed: `node scripts/categorize.js` and
`node scripts/download_media.js` first.)

## How sync behaves

- Notes, tags, favorites, read-state, and Notebook entries save to the
  browser instantly and push to KV ~0.6 s later (plus a flush when you close
  the tab). The sidebar shows "✦ notes synced to cloud" when the endpoint is
  live.
- On load, the newer of local vs cloud wins wholesale — with one user this
  only matters if you edit on two devices within the same minute.
- KV is eventually consistent across regions: a note can take up to ~60 s to
  appear on a device in another city. Fine for bookmarks, worth knowing.
- In-app JSON imports (the ⇪ button) stay per-device for now; the durable
  path for new bookmarks is updating `bookmarks_export.json` and redeploying.
- Local dev: `npm run dev` has no API → app quietly runs local-only.
  `npx wrangler pages dev` after a build serves functions + a local KV, so
  sync can be tested without deploying.
