# art-gallery

Dennis Hammerschlag's painting portfolio — a single-page, responsive site for browsing, pricing, and enquiring about original paintings.

## What's here

- `index.html` — the whole site (HTML, CSS and JS in one file). No build step, no dependencies to install.

## Running it locally

Just open `index.html` in a browser, or serve the folder with any static file server, e.g.:

```
npx serve .
```

## Deploying

This is a static site, so it works as-is on GitHub Pages, Netlify, Vercel, or any static host. For GitHub Pages: repo Settings → Pages → deploy from the `main` branch, root folder.

## Replacing the placeholder paintings

The gallery currently uses abstract CSS gradients as stand-ins for real photos, so the layout could be judged before photography was ready. To swap in real work:

1. Open `index.html` and find the `pieces` array near the top of the `<script>` tag at the bottom of the file.
2. For each painting, change its `art` value from a gradient string to an image, e.g.:
   ```js
   art: "url(images/sunset-ridge.jpg) center / cover"
   ```
3. Add your photos to an `images/` folder next to `index.html`, compressed to roughly 1600px on the long side.
4. Update `title`, `medium`, `size`, `year`, `price` and `desc` for each real piece, and add or remove entries as needed.

## Contact details

The "Inquire" and "Email the studio" links currently point at Dennis's SOLIDitech email — search for `mailto:` in `index.html` to update it to a dedicated art address. The Instagram and mailing-list buttons in the Contact section are placeholders (`href="#"`) waiting on real links.
