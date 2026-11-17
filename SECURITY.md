# Security controls and deployment

The VAPT findings have application fixes in this repository. The original
`VAPT_REPORT.md` and `security/vapt-results.json` describe the pre-fix revision;
see `security/REMEDIATION.md` for the current status and test evidence.

## Input limits

`js/services/security-policy.js` defines the enforced limits:

- 25 MiB per file; JPEG, PNG, and non-animated WebP images only.
- 100 pages per scan, including queued images; a 100 MiB stored/queued input budget.
- 16 megapixels per image or rendered PDF page; dimensions at most 16384 pixels.
- 100 megapixels of cumulative PDF rendering per import.
- 60 seconds per PDF/OCR operation; one PDF import and one OCR worker at a time.

Large photos, PDFs, and uncommon image formats can now be rejected intentionally.
JPEG headers must expose a supported frame header within the first 256 KiB.
These limits bound application allocations; they are not a guarantee about the
internal peak memory use of browser decoders or PDF.js on hostile input.

Clear Session clears all pages, queued files, editor and preview images, canvas
pixels, OCR text, and editing state. It stops the camera, cancels PDF/OCR work,
and invalidates pending asynchronous results. Closing OCR clears its text.
An OCR worker still initializing is terminated once startup settles; a second
worker is blocked while that cleanup is pending.
Downloads already saved and text already copied to the system clipboard are
outside the session and remain on the device. Browser memory is garbage
collected; this control does not promise forensic memory erasure.

## Dependencies

All executable dependencies, PDF worker/rendering assets, OCR worker/WASM core,
and English language data are served from `vendor/`. Ship that directory with
the site. There are no required CDN connections in normal operation.

`vendor/manifest.json` records exact versions, npm archive SHA-512 integrity,
and SHA-256 digests of shipped files. `npm test` verifies every asset digest.
The update helper `security/vendor-dependencies.ps1` downloads pinned releases,
checks npm archive integrity, and extracts the allowlisted files. OpenCV and the
English model come from their project-hosted versioned URLs; their content is
recorded in the asset manifest. Dependency downloads do not imply a complete
third-party code audit. Review advisories and release notes before updating,
then review manifest changes and rerun all tests. Do not deploy the helper,
its download cache, test fixtures, or local test server as public endpoints.

PDF.js is pinned to 6.5.438 and its matching worker. Both PDF entry points set
`isEvalSupported: false`, disable XFA, and do not instantiate a scripting-enabled
viewer. `enableScripting: false` is supplied defensively; the PDF.js display API
used here only renders pages. No form/annotation scripting UI is loaded.

## Hosting

Use HTTPS, with correct JavaScript MIME types for `.js` and `.mjs` and
`application/wasm` for `.wasm`. Treat `.traineddata.gz` as a compressed **file**,
not as an HTTP `Content-Encoding: gzip` response: Tesseract handles its gzip
contents itself. Disable automatic content decoding rules for that model URL.

The `_headers` file provides response policies for hosts that support that
format, such as Netlify and Cloudflare Pages. Other servers must configure
equivalent response headers. Test the actual deployed headers; adding a file
does not configure an arbitrary host. `frame-ancestors`, HSTS, Permissions-Policy,
and `nosniff` require response headers. The HTML also provides a CSP and referrer
fallback for generic static hosts. Avoid serving untrusted uploads from this
same origin.

The current OpenCV build uses dynamic function generation internally, so
`script-src` explicitly permits `unsafe-eval` and WASM compilation. Inline page
scripts and third-party script origins remain disallowed. Removing `unsafe-eval`
requires a compatible OpenCV build or moving that processing to an isolated
origin; simply removing it breaks initialization. The PDF vulnerability fix
therefore relies on the patched library and explicit safe parser options,
rather than assuming that CSP prevents dynamic evaluation.

## Verification

```powershell
npm ci --ignore-scripts
npm test
npm run test:browser
```

Browser checks use installed Microsoft Edge in headless mode and a temporary
loopback-only HTTP server. They generate synthetic scan content, run OCR,
render/import PDFs, export PDFs/ZIPs, and test sensitive-state clearing. They
block external requests. Playwright is a development-only dependency.

Deploy only `index.html`, `styles.css`, `js/`, `vendor/`, and the supported
hosting header configuration. Keep `security/`, `node_modules/`, report files,
and development package files out of the published directory. Verify HTTPS,
headers, camera permissions, and memory behavior on target mobile devices.
