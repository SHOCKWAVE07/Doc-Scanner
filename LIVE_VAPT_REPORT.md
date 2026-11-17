# GovScan — live deployment VAPT reassessment

**Target:** [https://docscannerme.netlify.app/](https://docscannerme.netlify.app/)  
**Assessment date:** 18 November 2026 (Asia/Calcutta; evidence timestamps are UTC)  
**Reference workspace revision:** `2f5ec709c4116d78735961d7f9d7f122a2ba160a`  
**Classification:** Confidential — keep this report outside the public deployment  
**Type:** Authorized, source-assisted live security reassessment with controlled browser tests

## Executive result

The updated deployment contains the fixes for the four original VAPT findings.
The patched PDF.js loader, safe parser options, resource validation, local
dependencies, and session-clearing implementation are present in the served
application. HTTPS and the intended security response headers are active.

**Two Low-severity deployment findings remain:** unnecessary development and
assessment files are publicly accessible, and two vendored files no longer
match the exact hashes in the published integrity inventory. The latter
differences were confirmed to be line-ending conversion only; no executable
content change was found in those files.

No Critical, High, or Medium vulnerability was identified within the tested
scope. This is a bounded reassessment, not a guarantee that the site has no
remaining vulnerabilities, an exhaustive penetration test, or a compliance
certificate. Residual assessed risk for the confirmed findings is **Low**.

## Scope and method

- Read-only HTTP requests to the supplied hostname and a small, explicit set
  of application/development paths. HTTP redirect and HTTPS certificate
  validation were checked using normal client trust validation.
- Inspection of HTML, served JavaScript, response headers, script origins,
  MIME types, OCR model delivery, and the deployed dependency inventory.
- SHA-256 verification of **224 deployed assets**, approximately **39.4 MB**,
  against the local reviewed inventory, using at most four concurrent requests.
- Real browser tests in headless Microsoft Edge **157.0.4341.60**, with fresh
  browser state and synthetic documents. No actual identity records were used.
- Benign DOM injection probes, safe input-rejection checks, and deliberately
  delayed browser callbacks to verify clearing of pending asynchronous work.
- **14 local regression groups** were rerun for the reviewed code, including
  PDF option validation, budgets, failed-import cleanup, cancellation, camera
  lifecycle callbacks, dependency hashes, and syntax checks for 16 app files.

No exploit PDF, real memory-exhaustion attempt, traffic stress, credential
attack, infrastructure scan, server mutation, deployment change, or physical
camera test was performed. The browser cancellation tests replace selected
callbacks in the tester's isolated browser to create deterministic races;
they do not alter the deployed files. There is no supplied backend/account
system to assess. Other Netlify sites, provider internals, and domains are
outside scope.

## Original findings — live retest status

| Original finding | Live verification | Result |
|---|---|---|
| VAPT-01: vulnerable PDF.js configuration | Served handler uses local PDF.js 6.5.438 and matching worker. Both safe entry points remain in reviewed source. Real PDF export/import succeeds. | Remediated in tested deployment |
| VAPT-02: unbounded processing and failed-import cleanup | Served handler/policy/app match reviewed source; safe oversized inputs are rejected before reading/decoding. Local resource/cleanup regression tests pass. | Remediated at code/control level; real exhaustion not attempted |
| VAPT-03: third-party executable CDN loading | HTML uses local scripts. Actual PDF/OCR/ZIP flows make no observed external runtime requests. Inventory exists; see LIVE-02 for two byte-level discrepancies. | Original CDN issue remediated; inventory follow-up open |
| VAPT-04: residual sensitive state | Clear Session removes editor, preview, canvas, OCR, pages and queue; delayed image/OCR/save/rotation results cannot restore cleared state. | Remediated in tested flows |

The main app, PDF handler, and security-policy source files match the workspace
after newline normalization. The deployed HTML has an extra Netlify hosting
comment and normalized newlines; ignoring HTML comments and inter-tag
whitespace produces the same content. This HTML difference is not counted as
a vulnerability.

## LIVE-01 — Development and assessment files are publicly accessible

**Severity:** Low  
**Category:** Unnecessary information exposure / deployment configuration  
**Status:** Open

Unauthenticated GET requests returned HTTP 200 for:

| Public path | Observed content |
|---|---|
| `/package.json` | Development package metadata |
| `/security/vapt-checks.cjs` | Security regression source |
| `/VAPT_REPORT.md` | Historical vulnerability assessment, marked Confidential |

The report contains vulnerability details, assessed revisions, implementation
locations, and mitigation guidance. These files are not required by end users.
Publishing them exposes internal assessment information and makes application
reconnaissance easier. This is **not** a claim that those old vulnerabilities
remain exploitable, that static application source can be kept secret, or that
server-side code is executing from the `.cjs` file.

The explicitly checked `/.git/HEAD` and `/.env` paths returned **404**. No
credential contents were retrieved. Other untested paths cannot be assumed
absent.

**Safe reproduction:** Request the three listed public paths in a browser or
HTTP client; observe the returned file rather than a 404 page. The check
distinguished actual content from an HTML fallback.

**Remediation:** Publish a dedicated directory containing only `index.html`,
`styles.css`, `js/`, `vendor/`, and the supported `_headers` configuration.
Configure Netlify's publish directory to that output, rather than publishing
the repository root. Exclude reports, tests, helper scripts, package metadata,
download caches, and development dependencies. Keep reports in private
storage. Disabling directory listing alone does not prevent direct file GETs.

**Retest acceptance:** The unnecessary paths return 404/403 without their
contents, while scanning, PDF import, OCR, downloads, and security headers
continue to work. Verify exclusion in the published artifact as well as HTTP
responses.

## LIVE-02 — Published vendor hashes do not describe all shipped bytes

**Severity:** Low  
**Category:** Integrity inventory / release reproducibility  
**Status:** Open

Of 224 checked vendor files, **222 matched** the recorded SHA-256 digests and
two did not:

| Asset | Reviewed bytes | Live bytes | Analysis |
|---|---:|---:|---|
| `vendor/jscanify-1.4.3/src/jscanify.js` | 7,585 | 7,322 | 263 CRLF sequences converted to LF |
| `vendor/jscanify-1.4.3/LICENSE` | 1,089 | 1,069 | 20 CRLF sequences converted to LF |

Both live files are exactly equal to their local counterparts after CRLF-to-LF
normalization. There is **no evidence of malicious code replacement** in these
differences. Nevertheless, the published manifest claims exact byte integrity
and cannot currently be used to verify those two deployed files reliably.

For the executable jscanify file:

```text
Expected SHA-256: a09dadd36ad4103e693523677f1aba3740d06f2dcdeb3ed87c66022e6ac0d13d
Live SHA-256:     7463ca648de2c081a07ef556e79d5d6b7525f2a5e2ca55fefdcb69608b014ea3
```

**Remediation:** Preserve vendored bytes through Git and deployment, for example
with a reviewed `.gitattributes` rule such as `vendor/** -text`, and restore the
exact files from the verified package archive before committing/redeploying.
Alternatively, explicitly define canonical release text normalization and
generate the inventory from the final artifact after that normalization.
Review intended changes before updating hashes; do not blindly accept an
unknown deployed hash. Verify the actual published artifact in CI.

**Retest acceptance:** Every deployed file matches its manifest digest and the
reviewed release inventory, including across fresh Windows/Linux checkouts.

## Additional observations

**CSP compatibility allowance — Informational:** The live policy includes
`script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'` and inline styles. The current
OpenCV build uses dynamic function generation, so this is a documented
compatibility choice. It weakens one CSP defense against script injection,
but is not an independently demonstrated injection vulnerability. Keep the
explicit safe PDF options and consider isolating/replacing OpenCV processing
to permit a stricter future policy. No inline page scripts or external script
origins were observed.

**Enhancement fallback — functional observation:** Synthetic scanning logs an
existing OpenCV enhancement error and saves through the application's fallback
path. Scanning/export tests complete, but image-quality behavior deserves
separate testing. Intentional cancellation also produces a handled AbortError
console message. Neither was counted as a security vulnerability or an
unhandled page error.

**Dependency review limit:** Published dependency bytes were checked against
the reviewed inventory. Maintainer advisory pages for PDF.js, jsPDF,
Tesseract.js, and JSZip were consulted. This is not an exhaustive audit of
OpenCV, WASM binaries, OCR models, transitive code, or all historical CVEs.
Dependency inventory matching does not itself prove absence of vulnerabilities.

## Verified live hosting controls

| Control | Observation |
|---|---|
| HTTPS | HTTP 200 using normal certificate validation |
| HTTP redirect | HTTP 301 to the HTTPS site |
| HSTS | `max-age=31536000; includeSubDomains; preload` |
| CSP | Same-origin scripts/workers/network; local Blob/data access; `object-src 'none'`; `base-uri 'self'`; `form-action 'none'` |
| Frame restrictions | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| MIME protection | `X-Content-Type-Options: nosniff` |
| Referrer policy | `no-referrer` |
| Permissions policy | `camera=(self), microphone=(), geolocation=()` |
| Root HTML cache | `Cache-Control: no-store` |
| PDF modules | Correct JavaScript MIME types for module and worker |
| OCR model | Intact gzip file without an HTTP content encoding that pre-decompresses it |

The HSTS `preload` token was observed; actual preload-list membership was not
verified. The checks establish the observed HTTPS connection, not supported
cipher/protocol enumeration or an independent TLS configuration audit.

## Browser verification

The live browser suite covers:

1. Application/OpenCV startup under the actual deployed CSP.
2. Synthetic image decoding, cropping/enhancement path, and page saving.
3. Downloadable PDF generation.
4. Real PDF import through PDF.js 6.5.438 and its local worker.
5. Real English OCR through local worker, WASM core, and language data.
6. Downloadable ZIP generation through the local ZIP dependency.
7. Clearing document, editor, preview, canvas, OCR, and queue state.
8. Delayed image decoding after session clear.
9. Oversized image-header rejection before decoding.
10. Delayed OCR completion after session clear.
11. Delayed page-save completion after session clear.
12. Delayed editor rotation after session clear.
13. External requests, missing assets, and unhandled browser errors.
14. Benign filename/OCR HTML injection probes rendered safely as text.
15. Spoofed SVG and oversized PDF rejection before rendering.

**Result: all 15 checks passed.** The complete run recorded no external runtime
requests, missing-asset responses, or unhandled browser page errors.

The complete status of each check is recorded in `security/live-browser-results.json`.
No physical camera, mobile memory behavior, malicious PDF exploit, or
post-browser-closure forensic recovery was tested.

## Evidence and reproducibility

| File | Purpose |
|---|---|
| `security/live-deployment-results.json` | Initial live header and safe-loader checks |
| `security/live-audit-results.json` | HTTP observations, every asset hash, MIME types, and small exposure-path check |
| `security/live-followup-results.json` | Exact analysis of newline/HTML-comment differences and public report content |
| `security/live-browser-results.json` | Per-test live browser results and diagnostics |
| `security/remediation-results.json` | Local parser/policy regression results |

```powershell
./security/check-deployment.ps1
node security/live-audit.cjs https://docscannerme.netlify.app/
node security/live-followup.cjs
node security/browser-checks.cjs https://docscannerme.netlify.app/
npm test
```

The general HTTP audit intentionally retains `REVIEW` entries for differences;
this report records their triage. The HTML comment change is benign, the two
vendor hashes are LIVE-02, and the development-file exposure is LIVE-01. A
machine `REVIEW` flag should not be interpreted as proof of exploitation.

Next action: remove development/report files from the published artifact,
correct the vendor inventory/release-byte handling, redeploy, and retest those
two Low findings. Keep this new report and its evidence out of public hosting.

References: [PDF.js maintainer advisories](https://github.com/mozilla/pdf.js/security/advisories),
[jsPDF maintainer advisories](https://github.com/parallax/jsPDF/security/advisories),
[Tesseract.js security page](https://github.com/naptha/tesseract.js/security),
and [JSZip security page](https://github.com/Stuk/jszip/security).
