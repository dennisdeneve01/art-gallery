# art-gallery

Dennis Hammerschlag's painting portfolio — a single-page, responsive site for browsing paintings and getting in touch.

## What's here

- `index.html` — the whole site (HTML, CSS and JS in one file). No build step, no dependencies to install.
- `images/` — one photo per painting (about 1400px on the long side).
- `images/thumbs/` — a smaller version of each photo, used in the gallery grid.

## Running it locally

Just open `index.html` in a browser, or serve the folder with any static file server, e.g.:

```
npx serve .
```

## Deploying

This is a static site, so it works as-is on GitHub Pages, Netlify, Vercel, or any static host. For GitHub Pages: repo Settings → Pages → deploy from the `main` branch, root folder.

## Adding or editing paintings

1. Open `index.html` and find the `pieces` array near the top of the `<script>` tag at the bottom of the file.
2. Each painting is one entry: `title`, `category`, `w` and `h` (the image's pixel size), `thumb`, `img` and `desc`. Add `credit` for works made after another artist, and optional `medium`, `size` and `year` if you want those shown under the title.
3. Save the full photo as `images/<name>.jpg` (about 1400px on the long side) and a smaller copy as `images/thumbs/<name>.jpg` (about 640px), then point `img` and `thumb` at them.
4. The filter chips are built from the categories, and the order they appear in is `CATEGORY_ORDER` just below the array. The gallery shows 12 paintings at first and loads 12 more each time "Show more" is pressed (`INITIAL_COUNT` and `PAGE_SIZE`).

## Contact details

The contact form and the email link both use Dennis's SOLIDitech email — search for `mailto:` in `index.html` to update it to a dedicated art address.
