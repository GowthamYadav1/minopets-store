# Mino Pets — storefront + order automation

Static aquarium shop (`dev/`) backed by Google Sheets + Apps Script (zero ₹ infra).

## Quick start (local)

```bash
npm install   # optional — only for local static server
cp dev/js/api-config.example.js dev/js/api-config.js
# Fill baseUrl + token from docs/private/LOCAL_SETUP.md (gitignored)
npm start
# → http://localhost:3000/dev
```

## Security (read before `git push`)

**Never commit:**

- `docs/private/LOCAL_SETUP.md` — API URL, tokens, admin notes  
- `dev/js/api-config.js` — copy from `api-config.example.js` locally  
- Apps Script **Script Properties**: `STOREFRONT_TOKEN`, `ADMIN_PASSWORD`, any future Razorpay keys  

**Safe in a public repo:**

- Static HTML/CSS/JS, `products.js`, docs  
- `api-config.example.js` with `PASTE_…` placeholders  

**Storefront token** in `api-config.js` is a soft throttle (not a secret vault). **Admin password** and payment keys stay in Script Properties only.

**Origin lock (Step 10):** Apps Script checks `window.location.origin` against Config `allowed_origins` (comma-separated). Use **origins only** — no path:

- `http://localhost:3000` (local `/dev`)
- `https://myminopets.com` (production)

Do **not** use `https://myminopets.com/dev` — browsers never send a path as origin.

**Prices & stock:** Server recomputes from the Sheet on `createOrder`; the browser cannot set prices or bypass inventory.

**Admin:** `YOUR_WEB_APP_URL?page=admin` — password from `setAdminPassword` in Apps Script.

## Build steps

Short summary: [`docs/BUILD.md`](docs/BUILD.md)

## Ops links (private)

Keep in `docs/private/LOCAL_SETUP.md` (not in git): Web App URL, admin URL, UPI when ready.
