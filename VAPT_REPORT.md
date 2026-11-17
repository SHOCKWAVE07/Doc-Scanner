# GovScan / Doc-Scanner — VAPT Report

> **Historical baseline:** This report describes the pre-fix revision below.
> Application fixes and subsequent verification are recorded in
> [security/REMEDIATION.md](security/REMEDIATION.md).

**Assessment date:** 17 November 2026 (Asia/Calcutta)  
**Assessed revision:** `2cfadba119b97ad8873ffb8d1d19b2f8413e1d7d`  
**Assessment type:** Source-assisted vulnerability assessment with controlled local security tests  
**Classification:** Confidential — application security findings  
**Overall assessed risk:** **High**, primarily because untrusted PDF import reaches a library version affected by arbitrary JavaScript execution.

## Executive assessment

The application is a static browser document scanner. It processes sensitive photos, identity documents, PDFs, and OCR text in the browser. No backend, account system, database, or upload API was found in the supplied repository.

Four findings were identified: **one High, two Medium, and one Low**. The most urgent issue is PDF.js 3.11.174 with its default evaluation setting, matching the affected configuration for CVE-2024-4367. A crafted PDF could execute JavaScript in the application's browser origin when imported. The version and reachable configuration were confirmed; execution of a real exploit PDF was not attempted.

Other findings concern unbounded document processing, third-party executable code without integrity verification, and residual sensitive information after clearing pages. Treat the application as requiring remediation before handling sensitive production documents. This is a risk recommendation, not a certification or a complete assessment of a production deployment.

## Scope, method, and limits

Reviewed `index.html`, `styles.css`, all 15 JavaScript source files, `README.md`, and `FEATURES.md`. Security review covered dependency loading, PDF/image input paths, DOM output, OCR, export, camera permissions and teardown, object URL lifecycle, and document clearing.

Performed:

- Manual source-to-sink tracing for file names, imported pages, OCR text, and export names.
- Targeted searches for HTML injection sinks, dynamic evaluation, credentials, network calls, and persistent browser storage.
- Verification of the PDF.js finding against the maintainer's security advisory.
- Dependency-free Node.js execution of actual PDF handler code and the actual Clear All callback using mocked browser/PDF APIs.
- JavaScript syntax parsing of all 15 application source files.

**Limits:** No deployment URL or hosting configuration was supplied. No browser automation capability was available for this assessment. No real malicious PDF, actual memory exhaustion, external application attack, live HTTP/TLS scan, mobile-device test, or camera-device test was performed. Mocked checks confirm application control flow and missing limits; they do not demonstrate a real parser exploit or browser crash. Authentication, authorization, sessions, server injection, and database attacks are not applicable to the supplied static architecture; any separately deployed backend remains outside scope.

Dependency review was targeted, not an exhaustive software composition audit. The repository has no package manifest, lockfile, vendored dependency inventory, or automated dependency-audit configuration. CDN bundles, OCR workers, WASM files, and language assets were not downloaded or exhaustively audited. No clean bill of health is implied for unreported dependencies.

Severity is a qualitative application-specific assessment based on impact, reachability, and attack prerequisites. No independent CVSS scores are claimed. Findings overlap in their possible impact and should not be summed into a numerical risk score.

## Findings summary

| ID | Finding | Severity | Evidence status |
|---|---|---|---|
| VAPT-01 | Vulnerable PDF.js configuration reachable through PDF import | High | Version/configuration confirmed; exploit execution not tested |
| VAPT-02 | Unbounded PDF/image processing and incomplete failed-import cleanup | Medium | Source review and mocked execution |
| VAPT-03 | Third-party scripts execute without integrity verification | Medium | Confirmed in source; compromise is a conditional threat |
| VAPT-04 | Clearing pages retains sensitive editor/preview/OCR state | Low | Actual clear callback executed with mocked UI state |

## VAPT-01 — Vulnerable PDF.js configuration reachable through PDF import

**Severity:** High  
**Classification:** CWE-1395, dependency with a known vulnerability; CVE-2024-4367 / GHSA-wgrm-67xf-hhpq  
**Affected code:** `js/services/pdf-import-handler.js:34`, `:39`, `:68`, `:137`; UI entry point `js/app.js:739`.

The loader requests PDF.js **3.11.174** and its matching worker from cdnjs. Both `importPDF()` and `renderPageToCanvas()` call:

```js
this.pdfLib.getDocument({ data: arrayBuffer }).promise;
```

Neither supplies `isEvalSupported: false`. The maintainer advisory identifies versions through 4.1.392 as affected when the default `isEvalSupported: true` is used, and identifies 4.2.67 as the first patched version. Thus the configured version and options match the advisory. An independently deployed CSP that blocks dynamic evaluation could reduce exploitability, but production headers were not available to verify.

**Attack prerequisite and impact:** An attacker must persuade a user to import a crafted PDF. Successful exploitation would execute JavaScript in the hosting origin, potentially reading document pixels, OCR text, and browser-accessible state, changing exports, or transmitting sensitive data subject to browser/network policies. This finding concerns browser-origin execution; operating-system code execution was not established.

**Evidence and safe reproduction:** Run `node security/vapt-checks.cjs`. The first check invokes both real handler methods with a mock PDF library, records their `getDocument` options, and verifies that only `data` is passed. It also confirms the version string in the loader. No exploit PDF is generated or opened.

**Remediation:** Upgrade PDF.js and its worker together to a maintained release after reviewing its current advisories. Version 4.2.67 is the historical minimum fix for this CVE, not a recommendation to use that old version today. Newer releases may require an ES-module loader migration. As an immediate mitigation, explicitly pass `isEvalSupported: false` at **both** call sites. Consider isolating untrusted document rendering in a dedicated origin with a restricted message interface; a PDF worker alone does not establish an origin boundary for this issue.

**Retest acceptance:** Confirm updated library/worker versions and explicit safe options at both entry points; import ordinary PDFs; in an isolated browser profile use a vetted inert regression fixture to verify that no origin-execution marker is produced. Also verify the actual deployed CSP.

**Primary reference:** [Mozilla PDF.js maintainer security advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq).

## VAPT-02 — Unbounded PDF/image processing and incomplete failed-import cleanup

**Severity:** Medium  
**Classification:** CWE-400, uncontrolled resource consumption; CWE-772, missing resource release  
**Affected code:** `js/services/pdf-import-handler.js:65–119`, `:136–150`; `js/app.js:786–845`.

PDF input is read fully into memory without checking its size. The importer processes every page, renders each viewport at scale 2, and assigns dimensions directly to a canvas without enforcing a page-count, dimension, total-pixel, time, or aggregate-memory budget. Image ingestion similarly queues any number of `image/*` files and loads the original image before `drawSource()` applies its 1800-pixel preview reduction. That preview reduction does not bound initial decoding cost.

If an import fails after earlier pages succeed, their object URLs are not revoked in the error path. Neither PDF path destroys the loaded PDF document in a `finally` block. This can compound retained resources during repeated imports or failures.

**Attack prerequisite and impact:** A user imports a large or deliberately expensive file, or repeatedly imports documents. The affected browser tab may become unresponsive, lose unsaved scans, or terminate. This is client-side availability exposure; a shared-server denial of service was not established.

**Evidence and safe reproduction:** The test supplies a mock file with a declared size of 1 GiB, a mock 1000-page PDF, and 100000 × 100000 viewports. The actual importer reads it and accepts every page and dimension. The canvas API is mocked, so these dimensions allocate no image buffer. A separate test fails page 2 and confirms that the page-1 object URL is left unreleased and document destruction is never called.

**Remediation:** Enforce documented budgets before reading files and before rendering pages: input bytes, number of queued files/pages, per-page dimensions/pixels, aggregate pixels, and elapsed processing time. Select limits based on supported mobile devices; example starting limits are 25 MiB per input, 100 pages per scan, and 16 megapixels per rendered page, subject to device testing. Bound image decoding dimensions using an appropriate decoder where available. Provide cancellation, release canvases, destroy PDF loading/document resources, and revoke all partially created URLs on failure. Serialize or otherwise bound concurrent imports/OCR/export operations.

**Retest acceptance:** Inputs beyond every configured threshold must be rejected before expensive work, normal documents must still import, cancellation must stop processing, and repeated failed imports must release their URLs and parser resources. Verify peak memory and responsiveness on representative mobile browsers.

## VAPT-03 — Third-party scripts execute without integrity verification

**Severity:** Medium  
**Classification:** CWE-353, missing support for integrity checking  
**Affected code:** `index.html:12–15`; `js/services/pdf-import-handler.js:34–45`; `js/app.js:2177`.

OpenCV, jscanify, jsPDF, and Tesseract are loaded as third-party page scripts without `integrity` attributes. The dynamic PDF.js and JSZip loaders likewise do not set an integrity digest. Explicit versions are used, which helps reproducibility, but there is no application-side verification that a delivered script matches reviewed bytes. Workers and runtime assets also need a controlled distribution strategy.

**Attack prerequisite and impact:** This requires malicious or compromised dependency/CDN delivery; no CDN compromise was observed. A substituted page script would run with the application's privileges and could read locally selected scans/OCR or alter downloaded documents. HTTPS protects transport but does not protect against an authorized origin serving compromised content.

**Evidence and safe reproduction:** Inspect the referenced script tags and dynamic loader assignments. All omit integrity verification. This is a source-confirmed control gap, not evidence that the application currently exfiltrates documents.

**Remediation:** Prefer reviewed, versioned, self-hosted dependencies, workers, WASM, and OCR assets with a reproducible dependency inventory and update process. For remaining cross-origin script tags, use verified SRI hashes and suitable `crossorigin="anonymous"` settings, including dynamic loaders where supported. SRI on a parent script does not automatically verify worker or other runtime downloads. Test loader error handling and enforce a restrictive CSP as an additional control.

**Retest acceptance:** A deliberately mismatched integrity digest must prevent script execution in a test browser. Network inspection should show only approved runtime asset origins and pinned releases. Verify that worker/OCR asset loading still functions with the deployed policies.

## VAPT-04 — Clearing pages retains sensitive editor/preview/OCR state

**Severity:** Low  
**Classification:** CWE-226, sensitive information not cleared before reuse  
**Affected code:** `js/app.js:1724`, `:1802–1806`, `:1831–1834`, `:1880`, `:1922–1928`.

The Clear All handler revokes saved-page URLs and empties `pages`, but does not reset the active editor image/canvas, queued files, OCR textarea, or preview image source. Editing a saved page loads its pixels into the editor. After Clear All, those editor pixels can remain displayed. Closing OCR only hides its modal and does not erase recognized text. Individual page deletion also does not clear corresponding editor/OCR state.

The confirmation specifically says “Delete all scanned pages,” so this is not a claim that all session data was explicitly promised to be erased. Nevertheless, retaining visible copies of deleted documents and OCR is a privacy weakness for a scanner handling identity records, especially on shared devices.

**Attack prerequisite and impact:** Another person obtains access to the same open browser session, or the user mistakenly assumes deleted content is gone. Residual text or pixels may be exposed. Cross-origin access or persistence after browser closure was not demonstrated. Revoking an object URL is not equivalent to erasing already decoded image pixels.

**Evidence and safe reproduction:** The test extracts and runs the actual Clear All callback with seeded editor/preview/OCR/queue state. `pages` becomes empty while all those other values remain. For browser confirmation: save a page, use Edit, run OCR, then Clear All and inspect the editor and OCR field. This manual browser sequence remains to be performed.

**Remediation:** Define whether Clear All clears saved pages or the complete scan session and label it clearly. For a full-session clear, cancel pending work, release all owned object URLs, clear active image references and file queues, reset editor/preview/processing canvases, clear OCR text and preview `src`, close related modals, and reset editing state. Prevent late asynchronous import/OCR completions from repopulating cleared state. Explain clipboard retention separately because copying text intentionally places data outside application memory.

**Retest acceptance:** After clearing or deleting the relevant page, its pixels and OCR cannot be recovered through the application's visible controls; queues are cleared according to the documented action and late asynchronous callbacks do not restore content. This does not promise forensic erasure of browser-managed memory.

## Additional observations and deployment checks

These are **not included in the four vulnerability counts**:

- **Hosting policies unknown:** No CSP meta tag or hosting configuration was found. Response headers may be supplied by the deployment, so missing production headers cannot be asserted. Verify HTTPS, HSTS where appropriate, `Content-Security-Policy` including `frame-ancestors`, `object-src`, and `base-uri`, `X-Content-Type-Options`, `Referrer-Policy`, and a camera/microphone `Permissions-Policy`. Frame restrictions must be delivered as response headers. Build and test CSP against actual OpenCV/WASM/OCR worker requirements rather than copying an untested policy.
- **Cache and transport privacy:** Verify actual document/asset network traffic, sensitive-page cache behavior, and behavior on shared devices. The repository does not establish production retention or compliance guarantees.
- **Filename logging:** `js/app.js:776` logs imported PDF filenames with logging enabled by configuration. Filenames can contain personal information; reduce production logging or omit names. No remote log collector was found.
- **Camera lifecycle:** The camera requests video only and its stop method stops media tracks. Verify real permission denial, navigation, background-tab, close, and clear-session behavior on supported devices.

## Positive controls observed

- Page filenames and badges are written using `textContent`; OCR is assigned to a textarea's `value`. The only `innerHTML` occurrence found empties the page container with a constant empty string. No direct filename/OCR DOM-XSS path was identified in this review.
- No direct application `eval()` / `new Function()` sink was found. This does not negate evaluation performed inside externally loaded libraries, including VAPT-01.
- No hardcoded application credential, document-upload call, or persistent browser-storage call was identified by the targeted source searches. External dependency execution was not instrumented, so these observations are not an end-to-end privacy guarantee.
- Download names remove common filesystem-reserved characters, and export uses a local Blob download.
- Several normal page lifecycle paths revoke object URLs. The gaps described above remain.

## Remediation order

1. **Before further sensitive PDF use:** Mitigate VAPT-01 at both call sites, then upgrade the library/worker together and regression-test rendering.
2. **Before production handling of sensitive documents:** Resolve VAPT-02 and VAPT-03, complete deployed-header/network review, and test on representative devices.
3. **Next privacy cleanup:** Resolve VAPT-04 and reduce filename logging. Retest async completion after clearing.
4. **Release assurance:** Maintain an inventory of direct and runtime-loaded dependencies, monitor advisories, and add security checks to the release process.

## Test evidence and reproduction

Run from the repository root with Node.js; no package install or network access is required:

```powershell
node security/vapt-checks.cjs
```

Recorded runtime: **Node.js v24.22.0**. Results: **four issue-reproduction checks confirmed**, plus **all 15 application JavaScript files passed syntax parsing**. A `CONFIRMED` result means the existing weakness was reproduced by the controlled harness; it is not a security test pass. The harness exits unsuccessfully if an expected current behavior changes, so it must be converted to expect rejection/cleanup after remediation.

Machine-readable evidence: [`security/vapt-results.json`](security/vapt-results.json). Reproduction source: [`security/vapt-checks.cjs`](security/vapt-checks.cjs).

**Changes made for this assessment:** This report and local evidence files only. Application source was not modified. Findings remain open; remediation and production/browser retesting are outstanding. This assessment is not a complete live penetration test or compliance certificate.
