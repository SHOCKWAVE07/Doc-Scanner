# GovScan / Doc-Scanner

A browser-based, multi-page document scanner. It turns photos, live camera
captures, and existing PDFs into corrected, enhanced pages that can be saved as
a PDF, JPEG, or ZIP archive.

## Features

- **Camera and gallery input** — Take a new photo on a phone or add one or many existing images.
- **PDF import** — Convert every page of an existing PDF into pages in the scan.
- **Automatic document detection** — Finds a reliable four-corner document boundary using OpenCV and a fallback contour detector.
- **Live auto capture** — Detects a document in the rear camera preview and captures it once it is stable and readable.
- **Live alignment guide** — Draws the detected document outline over the camera preview and shows capture status.
- **Eight-point crop editor** — Adjust four corners or four edge midpoints to accurately frame a document.
- **Centre magnifier** — Shows a 3× magnified view while a crop control is dragged, without sitting under the finger.
- **Perspective correction** — Straightens the selected quadrilateral into a flat rectangular page.
- **Automatic orientation correction** — Rotates sideways portrait documents into portrait orientation.
- **Quality feedback** — Scores sharpness and readability, and warns when the scan is not suitable.
- **Manual adjustments** — Preview changes to brightness, contrast, sharpness, and exposure; reset at any time.
- **Enhancement pipeline** — Applies mode-aware shadow removal, noise reduction, sharpening, and contrast treatment.
- **Scan modes** — Document, Book, ID Card, Passport, Whiteboard, and Photograph modes select appropriate processing defaults.
- **Compression profiles** — Choose High Quality, Balanced, or Small Size output settings and see the saving after optimization.
- **Multi-page management** — Review page thumbnails, drag to reorder, preview, edit, rotate, and delete pages.
- **OCR** — Recognize English text from a page, view it, and copy it to the clipboard.
- **Searchable PDF export** — Exports pages to an A4 PDF and embeds recognized text when OCR succeeds.
- **Image export** — Download a single page as JPEG or multiple pages as a ZIP file.
- **Progress and status feedback** — Shows detection, import, processing, OCR, and export progress.

## Quick start

1. Serve this folder from a local web server or HTTPS host. Live camera access requires a secure context (HTTPS or `localhost`).
2. Open `index.html` in a modern browser and wait for the scanner to finish loading.
3. Take a photo, add images, import a PDF, or enable **Auto Capture**.
4. Confirm the detected crop, make any adjustments, then choose **Save Page**.
5. Reorder or edit pages as needed, then use **Save All** to download a PDF, JPEG, or ZIP.

## Documentation

See [FEATURES.md](FEATURES.md) for a detailed explanation of how every feature works, including the scanning, processing, OCR, and export flows.

## Main dependencies

- OpenCV.js and jscanify for document detection, perspective correction, and image processing.
- jsPDF for PDF generation.
- Tesseract.js for OCR.
- PDF.js (loaded when needed) for importing PDF pages.
- JSZip (loaded when needed) for multi-image ZIP export.
