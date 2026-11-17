# Local runtime dependencies

These assets are included so document processing does not execute remotely
delivered CDN scripts or fetch OCR code/models at runtime. `manifest.json`
records versions, sources, npm archive integrity, and asset SHA-256 digests.
Run `npm test` to verify them. Review changes before regenerating the manifest.

| Component | Version | License notice |
|---|---|---|
| PDF.js (including fonts, cmaps, ICC and WASM assets) | 6.5.438 | `pdfjs-dist-6.5.438/LICENSE`; accompanying font/asset notices are retained |
| jscanify | 1.4.3 | `jscanify-1.4.3/LICENSE` |
| jsPDF | 4.2.1 | `jspdf-4.2.1/LICENSE` |
| Tesseract.js | 5.1.1 | `tesseract.js-5.1.1/LICENSE.md` |
| Tesseract.js Core (LSTM and SIMD LSTM) | 5.1.1 | `tesseract.js-core-5.1.1/LICENSE` |
| JSZip | 3.10.1 | `jszip-3.10.1/LICENSE.markdown` |
| OpenCV.js | 4.7.0 | `opencv-4.7.0/LICENSE` |
| English OCR language data | projectnaptha 4.0.0 distribution | `tessdata/LICENSE` |

Regenerate pinned assets using `security/vendor-dependencies.ps1`. The helper
rejects changed integrity values for already recorded package versions and
changed project-hosted bytes. An intentional update requires review of the
version, security advisories, source, and expected manifest changes.
