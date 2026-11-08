# BazarGoo Telegram Mini App (v1)

Mobile-first storefront for Angela's store **Bazar Goo** (bazargoo.com, prices in BDT ৳).
Bengali-first UI; product names in English exactly as they appear on the store.

## Files

| File | What it is |
| --- | --- |
| `index.html` | App shell (header, search, category chips, grid, detail/cart/confirm sheets) |
| `styles.css` | Mobile-first styles, Telegram theme aware (`--tg-theme-*` vars with fallbacks) |
| `app.js` | All logic: fetch products, search/filter/sort, cart (localStorage), order flow |
| `products.json` | Product data — **separate file, not hardcoded**. The app fetches it on every open. |
| `sync-products.py` | Re-fetch script — refreshes `products.json` from the live store (see below) |

## Features (v1)

- Product grid with real store images, names, prices (৳) and discount badges
- Category filter chips (real store categories) + search + price sort
- Product detail sheet with bigger image and a "bazargoo.com-এ দেখুন" link to the real product page
- Cart with quantities, remove, total in ৳ (saved in localStorage)
- **Order (no payment in v1):** inside Telegram the order is sent to the bot as JSON via
  `Telegram.WebApp.sendData()` (items, total, buyer Telegram id/name from `initDataUnsafe`);
  outside Telegram the order summary is shown with a **"অর্ডার কপি করুন"** button instead.
  After sending, a Bengali confirmation screen says the shop will message to confirm.
- Telegram integration: `ready()` + `expand()`, theme params, MainButton (cart / order),
  BackButton, haptics, `openLink()` for product pages. Works outside Telegram too
  (sticky cart bar replaces the MainButton).

**Never claimed in the app:** cash on delivery, delivery timing/coverage, returns or
warranty — none of those are verified facts for this store.

## Prices — how they stay fresh

**There is no public live product feed on bazargoo.com** (tested 2026-11-08):
`/products.json` → 404, `/api/products` → 404, `/api/store/products` → 404,
`/sitemap-products.xml` → 404, and `sitemap.xml` lists URLs only, no prices.
So the app **cannot** fetch live prices client-side — it reads the bundled
`products.json` on every open instead.

To keep prices fresh, re-run the sync script — no app rebuild needed:

```bash
python3 sync-products.py           # rewrites products.json from the live store
python3 sync-products.py --check   # dry run: shows what would change
```

What the script does: fetches `https://bazargoo.com/sitemap.xml` for the full product
list, then each product page, reading name/price/image from the page's JSON-LD
`Product` block (`offers.price`) and the category from the JSON-LD `BreadcrumbList`.
A daily scheduled run of this script keeps prices current. Any product whose price
cannot be verified as a single unambiguous number is **skipped, never guessed**
(see `_meta.skipped` in `products.json`).

## Data (fetched live 2026-11-08)

- **110 products** across 22 categories, price range ৳59 – ৳280,000.
  Every product's name, price and image URL was verified live on bazargoo.com;
  all 110 image URLs return HTTP 200.
- **Skipped (1):** Digital Tasbih Counter — its JSON-LD price is 0 and the page shows
  several bundle prices (৳337/495/549/634/1,148) with no single base price, so it
  was excluded rather than guessed.
- Cross-checks that match the live store: Samsung TV ৳75,000 · AirPods Pro ৳30,000 ·
  Single Night Vision Sunglass ৳198 · Flawless Facial Hair Remover ৳849 ·
  5 Layer Shoe Rack ৳496.
- Store's own category spellings are kept as-is: `Cleanning`, `Kithen`.
  Duplicates merged: `Home Appliance` → `Home Appliances`, `Book` → `Books`.
- Images are hotlinked from the store's CDN (`cdn.boneek.net`, `?w=480` grid /
  `?w=1080` detail). If an image fails to load, the app shows a 🛍️ placeholder tile.

## Hosting / bot wiring (for the parent agent)

1. Host this folder on any static HTTPS host (GitHub Pages / Netlify / Vercel / Cloudflare Pages).
2. Create the bot with @BotFather, then set the Web App URL (Menu Button) to the hosted `index.html`.
3. The bot receives orders via `web_app_data` updates (`sendData` payload) — the bot side
   must read `web_app_data.data` (JSON) and reply to the buyer to confirm the order.
4. Telegram WebApp JS SDK is loaded from `https://telegram.org/js/telegram-web-app.js`.

## What was NOT verified

- The app has **not** been opened inside a real Telegram client yet — `sendData()`,
  MainButton and theme behavior are implemented per the Telegram WebApp docs but need
  a live test once the bot + hosting are wired up.
- Prices are a snapshot from 2026-11-08; they change only when `sync-products.py`
  is re-run (recommend a daily scheduled sync).
