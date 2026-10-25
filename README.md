# Dr. Puneet Kumar Mishra — personal research website

A static website: no build step, no server needed. Open `index.html` in a browser, or upload the whole folder to any web host.

## Files

```
index.html           Home: cover photo and introduction, research, experience & education, toolkit, field-site map, contact
publications.html    Journal articles and manuscripts under review (filters, DOI links, copy-citation)
presentations.html   Conference presentations with venue map and year / role filters
projects.html        Research projects with a clickable satellite map
awards.html          Fellowships, awards, training and certifications
css/style.css        All styling, including the three band-combination colour themes
js/main.js           Band switcher, mobile menu, filters, copy-to-clipboard, map helper
js/scene.js          No longer used (it drew the old synthetic satellite hero); safe to delete
assets/              Cover photo (cover-960/1600/2560.jpg), portrait (puneet.jpg), favicon, CV PDF
vendor/leaflet/      Leaflet 1.9.4 map library (BSD licence, bundled so the maps work without a CDN)
```

## Things to update

- **Google Scholar**: the Scholar links currently point to a search for your name. Replace them with your
  profile URL (`https://scholar.google.com/citations?user=...`). Search for `scholar.google.com` in
  `index.html` and `publications.html` — two places on the home page (portrait badge and Contact) and one on
  the Publications page.
- **ResearchGate**: the CV's link was garbled, so the site uses `https://www.researchgate.net/profile/Puneet-Mishra-12`.
  Check it opens your profile.
- **CV PDF**: replace `assets/Puneet_K_Mishra_CV.pdf` with a newer version whenever you like; the file name must stay the same
  (or update the "Download CV" link in `index.html`).
- **Portrait**: `assets/puneet.jpg` is the photo extracted from the CV (229 × 295 px). A larger photo with the same
  proportions (roughly 3:4) will look sharper.
- **Phone number and referees** were deliberately left off the public site. Add them to the Contact section in
  `index.html` if you want them published.

## Adding content

- **A new paper**: in `publications.html`, copy one `<li class="pub" ...>` block and edit it. `data-tags` controls the
  filters: `journal` or `review`, plus `lead` or `coauthor`. Give the hidden `<span id="cite-N">` a new unique id and
  point the Copy button's `data-copy` at it.
- **A new talk**: in `presentations.html`, copy a `<li class="talk" ...>` block. Tags are the year (`y2026`) and
  `lead` or `coauthor`. If it is in a new year, add a `<li class="year-mark">` and a filter pill for that year.
- **A new project**: in `projects.html`, copy a `<li class="project" ...>` block, give it a unique `data-site` id, and
  add a matching entry (with latitude / longitude) to the `sites` list at the bottom of the file.
- **Map markers** on the home page live in the `sites` list at the bottom of `index.html`.

## Notes

- The home page opens on a cover photo (`assets/cover-*.jpg`, three sizes so phones download the small one). To swap
  it, export a wide photo (about 2.2 : 1) at 2560, 1600 and 960 px wide with the same file names. The framing is set by
  `object-position` in the `.cover-photo img` rule in `css/style.css`.
- The band switcher (True colour / False colour / Water index) recolours the whole site; the cover photo itself stays in
  true colour. Keys 1, 2, 3 also switch; the choice is remembered in the browser.
- Maps use Esri World Imagery tiles and need an internet connection; without one the page shows a plain list instead.
- Fonts (Spectral, Archivo) load from Google Fonts and fall back to system serif / sans-serif when offline.

## Hosting

Any static host works. Two free options:

- **GitHub Pages**: create a repository, upload these files, then Settings → Pages → deploy from the main branch.
- **Netlify Drop**: drag the folder onto app.netlify.com/drop.
