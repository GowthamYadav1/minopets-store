# Mino Pets — Build summary

Zero-₹ stack: static shop (`dev/`) + Google Sheets + Apps Script.

**Status:** Steps 0–10 done · **Step 11 in progress** (Sheets catalog) · **Step 12 PhonePe** (code ready — needs merchant credentials + redeploy)

---

## Steps (done)

| Step | What it delivered |
|---|---|
| **0 — Prep** | Google account, private `LOCAL_SETUP.md`, gitignore for secrets |
| **1 — Sheet schema** | Tabs: Products, Customers, Orders, Coupons, Config |
| **2 — getStock** | Apps Script Web App + token; live stock API |
| **3 — Stock UI** | Live caps, “Only X left”, out of stock |
| **4 — createOrder** | Reserve stock, server prices, TTL release |
| **5 — Checkout** | Cart form → Place order → Sheets |
| **6 — UPI + Mark Paid** | Pay UI + Admin confirm → finalize stock |
| **7 — WhatsApp** | After Mark Paid → `wa.me` customer message |
| **8 — Borzo** | Menu export paid local-delivery → CSV sheet |
| **9 — Coupons** | Damage credits; apply at checkout |
| **10 — Security** | Origin lock, no secrets in git, admin password |

---

## Step 11 — Catalog from Sheets *(current)*

Shop loads products via `getCatalog` (cache + skeleton while waiting). Day-to-day edits happen in the **Products** sheet.

**Still to finish / verify:**

1. Products header includes catalog columns (`sku`, `description`, filters, packs, `details_json`, etc.)
2. Rows match live catalog (use `docs/seed/` if re-seeding)
3. Apps Script deployed with `getCatalog` (**New version**)
4. `dev/js/api-config.js` has Web App URL + token
5. Hard refresh `/dev` → console: `[catalog] loaded from Sheets…`

**Related:** [`PRODUCT_IMAGES.md`](PRODUCT_IMAGES.md) · seed: `docs/seed/` · script: [`apps-script/Code.gs.md`](apps-script/Code.gs.md)

### Linked combo stock (`combo_items`)

Reuse `combo_items` — no new column. Link with **`product_id` only** (stable if you sort/group rows):

```json
[
  {"product_id":"1001","qty":4,"label":"Neon Tetra ×4"},
  {"product_id":"1022","qty":4,"label":"Cherry Barb ×4"},
  {"product_id":"1031","qty":4,"label":"Mountain Minnow ×4"}
]
```

Suggested ID ranges when regrouping the sheet: Fish `1001+`, Shrimps `2001+`, Plants `3001+`, Accessories `4001+`, Aquarium `5001+`.

- Combo **available kits** = min(floor(component stock ÷ qty))
- Orders reserve/deduct **component** rows (not the combo’s `stock_on_hand`)
- Old string-only `combo_items` still display; they don’t link stock
- No packs on linked combos; no nested linked combos
- After editing `Code.gs`: Deploy → **New version**

---

## Step 12 — PhonePe Payment Gateway

Auto-confirm paid orders via PhonePe Standard Checkout (replaces relying on “I have paid” + admin Mark Paid for most orders). Manual UPI remains as fallback.

### Merchant setup
1. Create / open a [PhonePe Business](https://business.phonepe.com/) merchant account and enable **Payment Gateway → Standard Checkout**.
2. From **Developer Settings**, copy **Client ID**, **Client Secret**, and **Client Version**.
3. Start in **Sandbox**, then switch Script Property `PHONEPE_ENV` to `production` when go-live.

### Apps Script (secrets — never commit)
1. Paste latest `docs/apps-script/Code.gs.md` into the script editor.
2. Run `setPhonePeCredentials` once: fill `EDITOR_CLIENT_ID` / `EDITOR_CLIENT_SECRET` / `EDITOR_ENV`, Run, then **clear those fields and Save**.
3. Config sheet: add row `phonepe_enabled` = `TRUE`.
4. **Deploy → Manage deployments → Edit → New version** (required after Code.gs changes).

### Storefront flow
1. Customer places order (stock reserved as today).
2. **Pay with PhonePe** → Apps Script `createPhonePePayment` → redirect to PhonePe checkout.
3. After pay, customer returns to `?phonepe_order=MINO-…`.
4. Storefront calls `confirmPhonePePayment` → Order Status API → on `COMPLETED` runs same stock finalize as Mark Paid (`status=paid`).

### Fallback / interim (PhonePe KYC pending)
While PhonePe is not live, **I have paid** auto-marks the order `paid` (same stock finalize as admin Mark Paid). No admin step needed.

- Default: auto-confirm ON when PhonePe is off
- Config `auto_confirm_on_report` = `FALSE` → require admin Mark Paid again
- Config `auto_confirm_on_report` = `TRUE` → keep trust-customer even after PhonePe is live
- After PhonePe goes live (and this key is unset): UPI “I have paid” goes back to `payment_reported` + admin

UPI + admin Mark Paid still work anytime.

### Notes
- Amount is sent in **paisa**; minimum ₹1.
- Redirect URL origin must be in Config `allowed_origins` (e.g. `http://localhost:3000`, `https://myminopets.com`).
- Webhooks are optional later; redirect + status poll is enough for v1.

---

## Where things live

| Need | Place |
|---|---|
| Local API URL / tokens | `docs/private/LOCAL_SETUP.md` (gitignored) |
| Storefront API config | `dev/js/api-config.js` (gitignored; copy from `.example`) |
| Apps Script source | `docs/apps-script/Code.gs.md` · `Admin.html.md` |
| Nav categories | `products.js` → `categories` |
| Filters | `filter-config.js` |
| Product photos | `assets/products/{SKU}-01.jpg` |

**Admin:** `YOUR_WEB_APP_URL?page=admin`
