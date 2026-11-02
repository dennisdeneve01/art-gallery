# art-gallery

Dennis Hammerschlag's painting portfolio — a single-page, responsive site for browsing paintings and getting in touch.

## What's here

- `index.html` — the whole site (HTML, CSS and JS in one file). No build step, no dependencies to install.
- `api/` — small server functions for the canvas-print shop (Paystack payments + Prodigi printing). See **Selling canvas prints** below.
- `shop/` — print sizes, prices and the list of paintings for sale.
- `images/` — one photo per painting (about 1400px on the long side).
- `images/thumbs/` — a smaller version of each photo, used in the gallery grid.

## Running it locally

Just open `index.html` in a browser, or serve the folder with any static file server, e.g.:

```
npx serve .
```

## Deploying

Without the shop, this is a static site and works on any static host. **With the shop it must be hosted on Vercel** (the `api/` folder runs there as serverless functions; GitHub Pages can't run them). Until the shop is set up the site works exactly as before: no Buy buttons appear.

## Adding or editing paintings

1. Open `index.html` and find the `pieces` array near the top of the `<script>` tag at the bottom of the file.
2. Each painting is one entry: `title`, `category`, `w` and `h` (the image's pixel size), `thumb`, `img` and `desc`. Add `credit` for works made after another artist, and optional `medium`, `size` and `year` if you want those shown under the title.
3. Save the full photo as `images/<name>.jpg` (about 1400px on the long side) and a smaller copy as `images/thumbs/<name>.jpg` (about 640px), then point `img` and `thumb` at them.
4. The filter chips are built from the categories, and the order they appear in is `CATEGORY_ORDER` just below the array. The gallery shows 12 paintings at first and loads 12 more each time "Show more" is pressed (`INITIAL_COUNT` and `PAGE_SIZE`).

## Contact details

The contact form and the email link both use dennishammerschlag01@gmail.com — search for `mailto:` in `index.html` to change it.

## Selling canvas prints

How it works: visitor opens a painting -> **Buy a canvas print** -> picks a size -> enters delivery details -> sees shipping + total -> pays on Paystack -> Paystack tells `api/webhook.js` -> the server re-checks the payment with Paystack and places the order with Prodigi -> Prodigi prints, stretches and ships it.

Prices are always worked out on the server (`api/_lib/shop.js`), never trusted from the browser. A payment whose amount doesn't match is flagged in the Vercel logs (`[ORDER FLAGGED]`) instead of being printed, and Prodigi's idempotency key means one payment can never create two print orders.

### Files you'll touch

- `.env` (copy `.env.example`; also add the same values in Vercel -> Settings -> Environment Variables): Prodigi key, Paystack secret key, exchange rate.
- `shop/catalog.json`: sizes and **prices in rand**. The prices in there are placeholders.
- `shop/print-files.json`: `"painting-slug": "https://link-to-high-res-file.jpg"` for each painting. Slugs are the image file names, e.g. `burnt-horizon`.
- Run `npm run sync-catalog` after adding or removing paintings in `index.html`. Set `"forSale": false` on a painting in `catalog.json` to hide its Buy button.

### Commands

- `npm test`: runs the whole payment -> print flow against pretend Paystack/Prodigi servers (nothing real is called).
- `npm run check-skus`: asks Prodigi (with your sandbox key) whether each canvas size/product code exists, and prints your real cost + shipping to South Africa so you can price properly. Pass a country code to check elsewhere: `npm run check-skus -- GB`.
- `npx vercel dev`: runs the site and API together on your computer.

### Going live checklist

1. Prodigi: swap to your live API key and set `PRODIGI_ENV=live` (live mode only sells paintings that have a high-res file in `print-files.json`).
2. Paystack: finish business verification, switch to `sk_live_...`, enable international cards if you want overseas buyers.
3. Paystack -> Settings -> API Keys & Webhooks: set the webhook URL to `https://YOUR-SITE/api/webhook`.
4. Order one real canvas of your own painting to yourself and check the colours.
