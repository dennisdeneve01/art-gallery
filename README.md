# art-gallery

Dennis Hammerschlag's painting portfolio — a single-page, responsive site for browsing paintings and getting in touch.

## What's here

- `index.html` — the whole site (HTML, CSS and JS in one file). No build step, no dependencies to install.
- `api/` — small server functions for the print shop (Paystack payments + Gelato printing). See **Selling canvas prints** below.
- `shop/` — print sizes, prices and the list of paintings for sale.
- `images/` — one photo per painting (about 1400px on the long side).
- `images/thumbs/` — a smaller version of each photo, used in the gallery grid.

## Running it locally

Just open `index.html` in a browser, or serve the folder with any static file server, e.g.:

```
npx serve .
```

## Deploying

Without the shop, this is a static site and works on any static host. **With the shop it is hosted on Cloudflare** (free), as a Worker that serves the site and runs the shop code (`src/worker.mjs` wraps the handlers in `api/`). GitHub Pages can't run them. Until the shop is set up the site works exactly as before: no Buy buttons appear.

Cloudflare setup (Workers & Pages -> Create application -> import this GitHub repo):
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Secrets (Settings -> Variables and Secrets, type **Secret**): `GELATO_API_KEY`, `PAYSTACK_SECRET_KEY` and `EMAILJS_PRIVATE_KEY`. Everything else (`GELATO_MODE`, `FX_RATE` ...) lives in `wrangler.toml`.

## Adding or editing paintings

1. Open `index.html` and find the `pieces` array near the top of the `<script>` tag at the bottom of the file.
2. Each painting is one entry: `title`, `category`, `w` and `h` (the image's pixel size), `thumb`, `img` and `desc`. Add `credit` for works made after another artist, and optional `medium`, `size` and `year` if you want those shown under the title.
3. Save the full photo as `images/<name>.jpg` (about 1400px on the long side) and a smaller copy as `images/thumbs/<name>.jpg` (about 640px), then point `img` and `thumb` at them.
4. The filter chips are built from the categories, and the order they appear in is `CATEGORY_ORDER` just below the array. The gallery shows 12 paintings at first and loads 12 more each time "Show more" is pressed (`INITIAL_COUNT` and `PAGE_SIZE`).

## Painting details, hero slideshow and emails

- **Details in the painting view:** add any of `"medium"`, `"size"`, `"year"` and `"original"` (`"available"`, `"sold"`, `"nfs"`, or your own wording) to a painting in the `pieces` array. Only the rows you fill in are shown.
- **Hero slideshow:** the paintings shown at the top of the page are the `HERO` list near the bottom of the script in `index.html` (image file names without `.jpg`).
- **Contact form:** sent through EmailJS using the ids in the `EMAILJS` constant in `index.html` (the same service as the personal site).
- **Order emails:** `api/_lib/email.js` emails the buyer a confirmation and sends you a "new order" note the first time an order reaches the printer. It needs the secret `EMAILJS_PRIVATE_KEY` in Cloudflare, "Allow EmailJS API for non-browser applications" switched on in EmailJS (Account -> Security), and for the buyer's email a template whose id goes in `EMAILJS_ORDER_TEMPLATE` in `wrangler.toml`. That template can use: `to_email`, `to_name`, `order_ref`, `painting`, `size`, `total`, `address`, `status_url`, `policies_url`. Without these settings no email is sent and orders work as before.

## Contact details

The email link uses dennishammerschlag01@gmail.com (search for `mailto:` in `index.html`); the contact form delivers to whatever address the EmailJS template is set up with.

## Selling prints

How it works: visitor opens a painting -> **Buy a print** -> picks slim canvas, thick canvas or framed print (and a frame colour) and a size -> enters delivery details -> chooses standard or express delivery (live prices and delivery times from Gelato) -> pays on Paystack -> Paystack tells `api/webhook.js` -> the server re-checks the payment with Paystack and places the order with Gelato -> Gelato prints it at the lab closest to the buyer (South Africa for South African orders) and ships it.

Prices are always worked out on the server (`api/_lib/shop.js`), never trusted from the browser. A payment whose amount doesn't match is flagged in the Cloudflare logs (`[ORDER FLAGGED]`) instead of being printed. Gelato has no idempotency key, so the server checks for an existing order with the same reference before creating one, only the webhook creates orders straight away, and the thank-you page only steps in 90 seconds after payment.

### Files you'll touch

- `.env` (copy `.env.example`; used by `npm run gelato-products`). On Cloudflare, secrets are set in the dashboard and other settings in `wrangler.toml`. For `npm run dev`, put the secrets in `.dev.vars`.
- `shop/catalog.json`: sizes and **prices in rand** for each option (`prices.slim`, `prices.thick` at a 75% margin; `prices.framed`, premium matte framed poster, at 60%), from Gelato's South African price lists (`cost`, in EUR). A size without a price for an option isn't offered in it.
- `shop/gelato-products.json`: Gelato's product code for each size, option (slim, thick, framed + frame colour) and orientation. Filled in by `npm run gelato-products`; a size without a code is not offered.
- `shop/print-files.json`: `"painting-slug": "https://link-to-high-res-file.jpg"` for each painting. Slugs are the image file names, e.g. `burnt-horizon`.
- Run `npm run sync-catalog` after adding or removing paintings in `index.html`. Set `"forSale": false` on a painting in `catalog.json` to hide its Buy button.

### Commands

- `npm test`: runs the whole payment -> print flow against pretend Paystack/Gelato servers (nothing real is called).
- `npm run gelato-products`: looks up Gelato's product codes for every size and thickness and saves them. Add a country to also price a sample delivery and see where it's printed: `npm run gelato-products -- ZA`.
- `npm run dev`: builds `dist/` and runs the site and API together on your computer with Cloudflare's local runtime (`wrangler dev`) (needs `.dev.vars`).
- `npm run build`: copies the public site into `dist/`.

### Going live checklist

1. Gelato: change `GELATO_MODE` to `live` in `wrangler.toml` (until then every order is a draft that Gelato never prints or charges for). Live mode only sells paintings that have a high-res file in `print-files.json`. Add a payment method in the Gelato dashboard.
2. Paystack: finish business verification, switch to `sk_live_...`, enable international cards if you want overseas buyers.
3. Paystack -> Settings -> API Keys & Webhooks: set the webhook URL to `https://YOUR-SITE/api/webhook`.
4. Order one real canvas of your own painting to yourself and check the colours.
