# Firebase setup (Mino Pets)

GitHub Pages stays the shop. **Firebase** handles login, saved addresses, live stock at checkout, orders, and Razorpay — so Place order / Pay now no longer wait on Apps Script.

**Sheets still hold:** product catalog you type, coupons (for now), Config, packing/Borzo exports.

**Firebase holds:** Auth, user profiles, addresses, checkout stock, orders, My orders.

---

## 1. Create the project

1. [Firebase console](https://console.firebase.google.com/) → Add project (e.g. `mino-pets`).
2. Build → **Authentication** → Get started.
3. Sign-in method:
   - **Phone** — enable (SMS). This is the only customer login. Needs **Blaze**.
   - **Google** — optional. Enable so customers can **Connect Google** from My Account after OTP. Google is not a login method.
4. Build → **Firestore Database** → Create (production). Region **`asia-south1`**.
5. Build → **Functions** — requires **Blaze** (pay-as-you-go). Typical cost at shop scale is ~₹0 plus SMS if customers use phone OTP.
6. Authentication → Settings → **Authorized domains**: add `localhost` and your GitHub Pages host (e.g. `yourname.github.io`).
7. Project settings → Your apps → **Web app**. Copy the config object.

## 2. Storefront config (local, not committed)

```bash
cp dev/js/firebase-config.example.js dev/js/firebase-config.js
```

Paste the web config + Functions base URL:

`https://asia-south1-YOUR_PROJECT_ID.cloudfunctions.net`

`dev/js/firebase-config.js` is gitignored.

## 3. Security rules

Deploy rules from this repo:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Or paste [`firestore.rules`](../firestore.rules) in Firestore → Rules.

## 4. Cloud Functions

From repo root (Node 20):

```bash
cd functions
npm install
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set SHEETS_TOKEN
firebase functions:secrets:set SYNC_SECRET
firebase functions:secrets:set COUPON_MUTATE_TOKEN
```

Set non-secret env in `functions/.env` (gitignored; copy from `.env.example`):

- `RAZORPAY_KEY_ID`
- `SHEETS_CATALOG_URL` — Apps Script web app URL (same as `MINO_API.baseUrl`)
- `ALLOWED_ORIGINS` — comma-separated, e.g. `https://yourname.github.io,http://localhost:5500`

```bash
firebase deploy --only functions
```

The deployed Functions include:

- `syncCatalog` — receives automatic catalog and intentional stock corrections from Apps Script
- `getStock` — returns live Firebase availability to product listings
- `addressSuggest` / `addressDetails` — Google Places proxy for checkout address suggestions
- `releaseExpiredHolds` — releases unpaid pending reservations on schedule
- `completeProfile` — claims the OTP-verified phone and completes the customer profile (email optional)
- `releaseOrphanGoogleUser` — deletes leftover Google-only Auth users so Connect Google can attach that email to the phone account

### Automatic Products-sheet sync (one-time setup)

1. Paste the latest [`apps-script/Code.gs.md`](apps-script/Code.gs.md) into Apps Script and save.
2. Deploy → Manage deployments → Edit → **New version**.
3. Reload the spreadsheet.
4. **Mino Pets → Configure Firebase sync**:
   - URL: `https://asia-south1-PROJECT.cloudfunctions.net/syncCatalog`
   - Secret: the same value as Firebase `SYNC_SECRET`
5. **Mino Pets → Install automatic sync** and approve the requested permissions.
6. Check **Mino Pets → Firebase sync status**.

The installable edit trigger queues Products changes and a one-minute trigger sends them to Firebase. **Sync Firebase now** remains available as a fallback.

## 5. Checkout address suggestions (Google Places)

The delivery address field suggests real addresses as the customer types and fills the pincode from the picked result. The Maps key stays in Functions — it is never sent to the browser.

1. [Google Cloud console](https://console.cloud.google.com/) → same project as Firebase → **APIs & Services** → enable **Places API (New)**.
2. APIs & Services → Credentials → **Create credentials → API key**.
3. Edit that key → **API restrictions** → restrict to *Places API (New)*. Leave application restrictions as *None*: the key is used server-side from Functions, not from a browser.
4. Store it as a Functions secret and redeploy:

```bash
firebase functions:secrets:set GOOGLE_MAPS_KEY
firebase deploy --only functions
```

Cost: Google gives **10,000 autocomplete requests free every month**, then $2.83 per 1,000. Typing is debounced and each checkout uses one billed session, so a few hundred orders a month stays inside the free tier. Suggestions are restricted to India and biased to a 50 km circle around Bengaluru.

Until `GOOGLE_MAPS_KEY` is set, the field stays a plain textarea — no errors, no suggestions.

## 6. Razorpay

- **Key ID** (public) → Functions env `RAZORPAY_KEY_ID`
- **Key Secret** → Functions secret `RAZORPAY_KEY_SECRET` (never git, never Apps Script after this)

Checkout is a four-step drawer: **Order details → Address → Payment → Confirm**. Self pickup skips Address and continues to payment from Order details; a Landmark maps link sits under the fulfillment field. Continue to payment reserves stock, creates/reuses one Razorpay order, and opens Razorpay immediately. A captured payment advances to confirmation; cancellation or failure shows a retry/status-check screen while the stock hold is still valid.

Functions `createRazorpayOrder` and `confirmRazorpayPayment` enforce the payment lifecycle:

- retries reuse the same Razorpay order instead of creating duplicate payment attempts;
- expired/non-pending stock holds cannot start a new payment;
- confirmation verifies the Razorpay signature, captured status, order ID, currency, and exact amount;
- a status check searches the Razorpay order for a matching captured payment;
- successful confirmation returns refreshed Firebase stock to the storefront.

**Back to order details** on the failure screen calls `cancelOrder`, which frees `stockReserved` right away instead of waiting for the 15-minute `releaseExpiredHolds` sweep, and marks the order `cancelled`. It first asks Razorpay whether that order has a captured payment; if it does, the order is marked **paid** and the customer is sent to confirmation instead of being cancelled.

## 7. What you still do in Sheets

| Tab | Role after Firebase checkout |
|---|---|
| Products | Catalog editor; changes sync to Firestore automatically |
| Coupons | Still validated via Apps Script when a code is applied |
| Config | Pickup maps URL, shipping copy, flags |
| Orders | Optional packing export (Function can append later) |

Browsing gets product content from cached `getCatalog`, then replaces its stock with live Firebase `getStock`. **Place order and Pay now only call Cloud Functions** when `MINO_FIREBASE.functionsBase` is set.

### Public percentage coupons

The Apps Script admin page can create a reusable promotion for all customers:

1. Open the deployed Apps Script URL with `?page=admin`.
2. Under **Create public offer**, enter a code and a whole-number percentage.
   - Recommended first offer: `MINO10` with `10`.
3. Select **Create public coupon**.

Public coupons are reusable without a per-customer limit and discount the **product subtotal only**. Delivery charges are never discounted. `MINO-RF-*` customer credits are phone-locked, fixed-value, and single-use.

The first public coupon automatically adds these trailing columns to the `Coupons` sheet:

- `discount_type`
- `percentage`
- `reusable`

To pause an offer, open Admin → **Recent coupons** and click **Disable**. Checkout then rejects the code until you click **Enable** again. You can still post the same code (`MINO10`) in a group or on the page, then turn it off after the campaign date. Codes are case-insensitive at checkout and are stored uppercase.

### Stock ownership

- Firebase `stockOnHand` and `stockReserved` are the operational source of truth.
- Edit Sheet `stock_on_hand` only to set an intentional absolute physical count/restock correction. That row is queued automatically.
- Do not edit Sheet `stock_reserved`; Firebase owns checkout holds and releases.
- Catalog-only edits never overwrite Firebase stock or reservations.
- The Sheet stock columns are not updated when Firebase orders are paid, so `stock_on_hand` in Sheets is the last manual count—not a live sales ledger.

## 8. SMS / Phone OTP

Phone login uses Google’s SMS. Enable Phone provider, Blaze, and test numbers in Auth → Phone while developing. Customers sign in with OTP only; Google is an optional link on My Account after the number is verified. The verified Firebase Auth phone is the customer key; the storefront cannot write or change it directly. Email on the profile is optional.

### If Send OTP fails (`auth/invalid-app-credential`)

1. Authentication → Settings → **Authorized domains** must include the host you are actually using: `localhost`, your GitHub Pages host (`something.github.io`), and `myminopets.com` if that is live.
2. The shop always sends **+91**. A US test row like `+1 999-999-9999` will not match what you type in the modal.
3. Use a test number that is stored as **+91…**. Example: Console `+91 11 1111 1111` / `123456` → type `1111111111` in the shop, then OTP `123456`.
4. `9999999999` only works if you add `+91 9999999999` (and a code) under **Phone numbers for testing**. Otherwise Firebase treats it as a real SMS and will fail.
5. Serve the shop over `http://localhost:…`, not as a `file://` page.

### Coupon mutation secret (one-time setup)

1. Paste the latest [`apps-script/Code.gs.md`](apps-script/Code.gs.md), save, and run `setCouponMutateToken()` once from the Apps Script editor.
2. Copy the logged value into the Firebase secret:

```bash
firebase functions:secrets:set COUPON_MUTATE_TOKEN
```

3. Deploy a **new Apps Script version**, then deploy Functions.

This secret authorises reserve / mark-used / release and paid-order mirroring. Never put it in `api-config.js`; the browser-visible `STOREFRONT_TOKEN` is only for read/preview actions.

## 9. If Firebase is not configured

The shop keeps working on Apps Script (slower checkout). Set `MINO_FIREBASE.enabled = false` or omit `firebase-config.js`.
