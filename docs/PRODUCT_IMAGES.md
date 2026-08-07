# Product images (SKU convention)

## Where files go

```text
assets/products/{SKU}-01.jpg   ← main (card) — also .png / .webp
assets/products/{SKU}-02.jpg   ← optional hover — same extension as -01
assets/products/{SKU}-03.jpg
```

Example for Neon Tetra (`MINO-FISH-NET`):

- `assets/products/MINO-FISH-NET-01.png`
- `assets/products/MINO-FISH-NET-02.png`

In Sheets, either leave `image` blank (shop tries `.jpg` then `.png`) **or** set:

`/assets/products/MINO-FISH-NET-01.png`

## What you edit

| Place | Field |
|---|---|
| Sheets `Products` | **Master** — `sku`, `image`, name, etc. ([`BUILD.md`](BUILD.md) Step 11) |
| `products.js` | `categories` / hero / Instagram (empty products array filled by API) |

Code builds: `/assets/products/{sku}-01.jpg` via `dev/js/product-images.js`.

## Hover image (desktop)

Cards show `-01` by default. On hover, if `-02` exists, the image swaps to it. Mobile stays on `-01`. Missing `-02` is fine — hover does nothing.

## Product video (`video_url`)

Paste a **full** Google Drive share link in Sheets `video_url`, e.g.:

`https://drive.google.com/file/d/FILE_ID/view?usp=sharing`

The shop converts that to Drive’s embed player (a plain `/view` link does **not** work as `<video src>`).

Also required:

1. File sharing: **Anyone with the link** → Viewer  
2. Whole URL in the cell (not truncated)  
3. Hard refresh the shop after catalog refresh  

Direct `.mp4` / CDN URLs also work (native HTML5 player).

## New product checklist

1. Pick SKU (e.g. `MINO-FISH-NT`)  
2. Drop `MINO-FISH-NT-01.jpg` (and `-02`…) into `assets/products/`  
3. Add product **row in Sheets** with matching `product_id` + `sku` (and catalog columns)  
4. Optional: set `video_url` to a Drive share link (see above)  
5. If new subcategory: add it under `categories` in `products.js` (nav)  
6. Hard refresh shop — catalog loads from Sheets  
