# GovScan feature guide

This document describes the working behavior of the app as implemented in the
browser. Processing happens locally in the page, except that the libraries
loaded from CDNs must be available when they are first needed.

## 1. Starting a scan

### Take Photo

On mobile, **Take Photo** opens the device camera through an image file input
that requests the environment-facing camera. The selected image enters the same
editing flow as an image selected from the gallery.

### Add Photos

**Add Photos** accepts multiple image files. The app queues them, opens the
first image in the editor, and opens the next queued image after the current
page is saved. This makes it possible to build a multi-page document from a
batch of photos.

### Drag and drop

The drop area accepts image files and sends them through the same queued image
flow. It is a convenient desktop alternative to the gallery picker.

### Import PDF

**Import PDF** loads PDF.js on demand, renders each source page at 2× scale,
and converts the rendered page to a JPEG-backed page in the app. Imported pages
retain their source filename and page number and can be previewed, rotated,
edited, reordered, exported, or deleted just like scanned pages.

## 2. Live auto capture

Enable **Auto Capture** to request rear-camera access and display a compact
16:9 live preview. The app processes alternate preview frames at a capped
resolution, which reduces CPU use while retaining enough detail for detection.

For each processed frame, it first asks jscanify/OpenCV for a paper contour. If
that result is missing or unsuitable, it uses an edge-and-contour fallback. A
candidate must be a convex quadrilateral, cover enough of the frame, have
reasonable corner angles and side proportions, and meet the confidence
threshold.

The green guide polygon is the detected document. Auto capture then requires:

1. a sufficiently confident detected document;
2. five recent stable detections, with average corner movement within the
   configured tolerance; and
3. acceptable sharpness and readability.

The status changes through searching, document found, hold steady, blurry, and
ready. When all checks pass, the app captures a fresh camera frame, opens it in
the scanner, saves the resulting page, and stops the one-shot auto-capture
session so the same document is not added twice.

## 3. Document detection, crop, and rotation

### Boundary detection

When an image is opened, the app tries to find its paper contour automatically.
It orders the four points as top-left, top-right, bottom-right, and bottom-left.
If the primary detector returns a weak rectangle, the OpenCV fallback searches
for a more plausible quadrilateral. If neither result is reliable, the editor
starts with an inset rectangular selection for manual adjustment.

### Eight-point crop controls

The crop overlay provides four numbered corner handles and four midpoint
handles. Dragging a corner changes only that corner. Dragging a midpoint moves
the two corners on that edge, which is useful for correcting a whole side at
once. Coordinates are converted between the displayed image size and the
full-resolution canvas, then clamped to the image bounds. Before committing a
drag, the app rejects very small or self-intersecting selections.

### Centre magnifier

While any crop handle is dragged, the editor displays a 3× magnified region
centred on the handle’s current image position. The bubble stays in the centre
of the editor rather than following the pointer, so a finger does not hide it.
It includes a grid and crosshair to make edge placement easier.

### Perspective correction

Saving a page converts the selected four points into an OpenCV perspective
transform. The selected trapezoid or skewed quadrilateral is warped into a
flat rectangle whose width and height are based on the longest opposing edges.
This is what makes an angled camera photo look like a scanned page.

### Automatic orientation correction

Before crop editing, the app checks whether the image dimensions match the
expected portrait document orientation. A sideways portrait image is rotated
90 degrees, then its boundaries are detected again. The app does not guess a
180-degree correction because dimensions alone cannot reliably identify an
upside-down page.

## 4. Quality and image processing

### Quality feedback

The quality panel rates **Sharpness** and **Readability** and displays an
Excellent, Good, Fair, or Poor result. It uses focus/blur analysis, noise, and
brightness/contrast signals to estimate whether text will be usable. Saving is
stopped with a retake message when the processed page fails the minimum quality
threshold.

### Manual image adjustments

The editor has real-time sliders for brightness, contrast, sharpness, and
exposure. Each change starts from the untouched loaded image, so the controls
remain reversible instead of stacking destructive edits. **Reset** returns all
four sliders to zero and redraws the original image.

### Enhance & Compress

The enhancement action creates an optimized scan variant. The OpenCV pipeline
can remove shadows, reduce noise, sharpen text with unsharp masking, and boost
contrast. It then encodes JPEG output with the selected compression profile and
reports the original size, new size, and reduction.

### Scan modes

The selected mode is passed to the enhancement pipeline and supplies defaults
for processing and quality:

| Mode | Intended use |
| --- | --- |
| Document | General paper documents; balanced defaults. |
| Book | Book pages; allows for page/spine characteristics. |
| ID Card | Small documents; prioritizes high clarity. |
| Passport | Passport pages; prioritizes high clarity. |
| Whiteboard | Whiteboard content; uses stronger contrast/glare-oriented settings. |
| Photograph | Photo scans; prioritizes preservation of the photographic appearance. |

### Compression profiles

Choose the profile before optimizing or saving:

| Profile | JPEG quality / maximum dimension | Trade-off |
| --- | --- | --- |
| High Quality | 0.92 / 2400 px | Best readability; larger files. |
| Balanced | 0.78 / 1800 px | Default balance of clarity and size. |
| Small Size | 0.60 / 1200 px | Smallest files; reduced fine detail. |

## 5. Page collection

Each saved, gallery, camera, or imported-PDF page becomes a card in **Scanned
pages**. Its badge identifies its source. The page count and export controls
update automatically.

### Reorder

Drag a page card over another card and release it to change the document order.
The new order is used by every export format.

### Preview, edit, rotate, and delete

Select a thumbnail to open a preview. From there you can return the page to the
crop editor, rotate it clockwise, run OCR, or delete it. Editing a saved page
replaces that page’s image instead of creating a duplicate. **Clear All**
removes every page after confirmation.

## 6. OCR and exports

### OCR

The page preview’s **OCR** action runs Tesseract.js with English recognition.
The app shows live progress and presents the recognized text in a read-only
area. **Copy Text** copies it to the clipboard. OCR failure does not remove or
alter the scanned page.

### PDF

**Save All** opens an export dialog. PDF export creates an A4 PDF with each
page scaled to fit within margins while preserving its aspect ratio and any
page rotation. When OCR is enabled and successful, invisible text is placed at
the corresponding positions, giving the exported PDF searchable text where
recognition is reliable.

### JPEG and ZIP

With one page, the export dialog can download that page’s JPEG directly. With
two or more pages, it can create a ZIP containing numbered JPEG files in a
`pages` folder. JSZip is loaded only when ZIP export is requested.

## 7. Configuration and browser requirements

`js/config.js` centralizes the detector confidence, quality thresholds,
stability requirements, preview/output resolution limits, enhancement values,
compression profiles, OCR language, and PDF settings. Adjusting it changes the
app’s operating behavior without changing the UI code.

Use a modern browser with JavaScript and canvas support. Camera auto capture
requires permission and a secure context: HTTPS or `localhost`. PDF import,
OCR, PDF export, and ZIP export require their corresponding CDN libraries to
load successfully.
