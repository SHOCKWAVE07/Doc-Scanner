# VAPT remediation and verification

**Date:** 18 November 2026 (Asia/Calcutta)  
**Baseline:** `2cfadba119b97ad8873ffb8d1d19b2f8413e1d7d`  
**Status:** All four reported findings have application-level fixes. The local
checks below verify those fixes; production hosting and physical mobile-device
validation remain outstanding. This is not an independent penetration-test
certificate or a claim that the application has no remaining vulnerabilities.

| Finding | Change | Verification |
|---|---|---|
| VAPT-01: vulnerable PDF.js | Replaced 3.11.174 with locally hosted 6.5.438 and the matching worker. Both entry points explicitly disable evaluation and XFA; rendering does not load a scripting-enabled viewer. | Safe options checked at both call sites; real exported PDF imported through the new module/worker in Edge. |
| VAPT-02: resource consumption and cleanup | Added input size/signature/dimension validation, scan/queue/page/pixel/output-byte budgets, operation timeouts, bounded concurrent imports/OCR, cancellation, parser destruction, and partial URL/canvas cleanup. | Tests reject oversized, invalid, excessive-page, and excessive-pixel input; verify rollback, null encoding, concurrency, and cancellation. |
| VAPT-03: unverified CDN scripts | All page scripts, PDF workers, auxiliary rendering assets, OCR workers/cores/models, and ZIP code now ship locally with an asset integrity inventory. Added same-origin CSP and hosting header configuration. | All asset digests checked. Real scan/OCR/PDF/ZIP browser flows succeed with external requests blocked. |
| VAPT-04: sensitive state retention | Clear Session removes editor, preview, canvas, OCR, file queue, and saved-page state; cancels PDF/OCR/camera work; invalidates asynchronous results. OCR closure and relevant page deletion clear sensitive copies. | Browser tests cover visible state and deliberately delayed image, OCR, save, and rotation completion; camera unit checks cover permission/metadata arriving after stop. |

## Files and behavior

- `js/services/security-policy.js`: common input limits and bounded image-header
  validation before browser image decoding.
- `js/services/pdf-import-handler.js`: local module loader; safe parser options;
  bounded rendering; operation timeout/cancellation; cleanup on success/failure.
- `js/app.js`: scan budgets, asynchronous session guards, local OCR lifecycle,
  local ZIP loader, complete session clearing, and reduced filename logging.
- `js/services/camera-stream-manager.js`: rejects late permission results and
  metadata callbacks after stop; releases tracks and bounds metadata startup.
- `index.html`: local dependencies, input format hints, Clear Session label,
  referrer policy, and a CSP fallback.
- `vendor/`: pinned runtime assets, upstream license notices, and integrity
  inventory. Adds approximately 40 MB of static assets; none are new document
  upload endpoints.
- `_headers` and `SECURITY.md`: response policy configuration and deployment
  requirements. `_headers` only takes effect on supporting hosting platforms.
- `package.json` / `package-lock.json`: pinned development-only browser tooling.

Supported photos are now JPEG, PNG, and non-animated WebP, up to 25 MiB and
16 megapixels per input. Additional scan/import budgets are documented in
`SECURITY.md`; inputs beyond them are rejected intentionally. English OCR
language data is loaded locally with persistent OCR model caching disabled.
Pending OCR worker initialization is allowed to settle before its worker is
terminated; a second OCR worker is blocked during that cleanup.

## Validation

Commands:

```powershell
npm test
npm run test:browser
```

`security/remediation-results.json` records policy/parser regression results
and application JavaScript syntax checks. The parser tests use mocked PDF and
canvas APIs so large-dimension inputs allocate no large image buffers.

`security/browser-results.json` records end-to-end results from headless
Microsoft Edge. The suite uses a loopback-only server with the same CSP plus
`frame-ancestors 'none'`, generates synthetic document images, scans and saves a
page, exports a PDF, imports that real PDF using the new PDF worker, recognizes
text with the real local OCR worker/core/model, exports a ZIP, and verifies
sensitive-state clearing and delayed-completion guards. External requests are
blocked and checked; missing assets and unhandled page errors fail the suite.
The suite does not use a real camera or a malicious exploit PDF.

The scan fixture exercised an existing enhancement fallback that logs an
OpenCV processing error and then saves the page through the application's
fallback path. That image-enhancement behavior was not part of these security
findings; mobile image-quality validation remains advisable.

The earlier `vapt-results.json` is preserved as baseline evidence. Its
`CONFIRMED` entries describe reproduced weaknesses before remediation. The
current `vapt-checks.cjs` expects safe behavior and now reports `PASS`.

## Deployment and residual limits

- Publish the local runtime assets with the application and verify `.mjs` and
  WASM MIME types. The OCR model gzip file must not be automatically decoded as
  an HTTP content encoding. Keep tests, reports, tooling, and download caches
  outside the published directory.
- Confirm HTTPS, response headers, frame restrictions, cache behavior, and
  camera permissions on the actual host. Local checks do not configure a live
  server or establish its security posture.
- OpenCV currently requires `unsafe-eval`; this compatibility allowance is
  explicit in CSP. The PDF fix uses a patched parser and disabled evaluation,
  rather than claiming CSP blocks every dynamic function call. Inline scripts
  and external script/network origins remain disallowed.
- Check target mobile browsers for memory and camera lifecycle behavior. No
  hostile real-world PDF corpus or exhaustive third-party dependency audit was
  run. Asset pinning does not replace dependency advisory monitoring.
- Clearing a scan does not erase saved downloads, the system clipboard, or
  browser-managed memory forensically.

Upgrade references: [PDF.js 6.5.438 release](https://github.com/mozilla/pdf.js/releases/tag/v6.5.438),
[CVE-2024-4367 maintainer advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq),
and [CVE-2026-16633 maintainer advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).
