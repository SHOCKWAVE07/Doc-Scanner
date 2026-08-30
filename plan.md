# Document Scanner Enhancement

## Engineering Instruction Manual for Coding Agent

**Document Type:** Engineering Implementation Specification
**Purpose:** Guide an AI coding agent/development team in implementing the Document Scanner enhancements defined in the BRD.

---

# 1. Engineering Objective

Enhance the existing Document Scanner application to provide a production-grade scanning workflow comparable to modern document-scanning applications.

The implementation must improve:

* Camera-based document capture
* Automatic document detection
* Perspective correction
* Image quality
* Image enhancement
* OCR accuracy
* Searchable PDF generation
* PDF editing
* Scan quality validation
* User guidance
* Scan review and correction
* Overall UI/UX

The implementation must **preserve all existing functionality unless explicitly superseded by the requirements below**.

Do not rewrite unrelated modules merely to implement these features.

Before making changes, inspect the existing architecture and identify:

1. Camera/scanning entry point
2. Image processing pipeline
3. Crop/alignment implementation
4. OCR implementation
5. PDF generation implementation
6. PDF import/export implementation
7. Navigation structure
8. State-management approach
9. Existing UI components
10. Existing test infrastructure

Reuse existing abstractions wherever possible.

---

# 2. General Development Rules

## 2.1 Code Quality

All implementation must follow the existing project's:

* Architecture
* Naming conventions
* Dependency management
* State-management patterns
* Error-handling patterns
* UI component conventions
* Testing conventions

Do not introduce a new architectural pattern unless the existing implementation cannot reasonably support the requirement.

---

## 2.2 Modular Design

Avoid implementing all scanning logic inside a single screen/controller/component.

Prefer separate modules/services for:

```text
Camera Capture
    ↓
Document Detection
    ↓
Perspective Correction
    ↓
Image Quality Validation
    ↓
Image Enhancement
    ↓
OCR
    ↓
PDF Generation
    ↓
PDF Management
```

Each stage should have a well-defined input and output.

---

# 3. Target Scanning Pipeline

The preferred scanning pipeline is:

```text
Open Scanner
      ↓
Camera Preview
      ↓
Document Detection
      ↓
Orientation Detection
      ↓
Quality / Stability Check
      ↓
Auto Capture
      ↓
Corner Detection
      ↓
Perspective Correction
      ↓
Image Quality Validation
      ↓
Smart Enhancement
      ↓
User Review
      ↓
OCR
      ↓
Searchable PDF
      ↓
PDF Management / Export / Share
```

Manual capture must continue to work even when Auto Capture is disabled.

---

# 4. Feature Implementation Requirements

# 4.1 Automatic Orientation Detection

## Requirement

Automatically detect whether the captured document is portrait or landscape and rotate it into the correct orientation.

## Implementation

Create an orientation-processing component/service.

The system should:

1. Receive the captured image.
2. Determine document orientation.
3. Compare detected orientation with the expected document orientation.
4. Rotate the image if required.
5. Pass the corrected image to subsequent processing.

Orientation correction must happen **before OCR**.

## Requirements

* Support portrait documents.
* Support landscape documents.
* Do not unnecessarily rotate correctly oriented images.
* Allow the user to manually rotate the image from the review screen.
* Preserve image quality during rotation.

## Acceptance Criteria

* A landscape document captured in portrait camera orientation is automatically corrected.
* A correctly oriented document remains unchanged.
* OCR receives the correctly oriented image.
* Manual rotation remains available.

---

# 4.2 Intelligent Document Boundary Detection

Replace or improve the existing document boundary detection implementation.

## Requirements

The detector should identify:

```text
Top Left
Top Right
Bottom Right
Bottom Left
```

and determine whether the detected quadrilateral represents the document.

The detector should attempt to work under:

* Uneven lighting
* Low-light conditions
* Complex backgrounds
* Slight perspective distortion
* Non-uniform backgrounds
* Partially visible document edges

## Live Preview

During camera preview:

* Detect document boundaries continuously.
* Update detected boundaries as the document moves.
* Avoid excessive visual jitter.
* Do not trigger capture until the document is sufficiently stable.

## Performance

Document detection during preview must be lightweight enough to avoid making the camera preview unusable.

Do not run expensive full-resolution processing on every preview frame.

Use an appropriately downscaled preview frame for detection and use the original/high-resolution frame for final processing.

---

# 4.3 8-Point Alignment

Extend the existing four-point crop system to support eight adjustment points.

## Existing Points

```text
Top Left
Top Right
Bottom Left
Bottom Right
```

## New Points

```text
Top Left
Top Center
Top Right

Right Center

Bottom Right
Bottom Center
Bottom Left

Left Center
```

## Behavior

The user must be able to drag each point independently.

The system must update the crop boundary in real time.

The implementation should prevent invalid geometry where possible.

For example:

* Points should not unexpectedly cross.
* Crop area should remain valid.
* Extremely small crop regions should be rejected.
* Perspective transformation must remain numerically stable.

## Important

Do not treat the eight points as merely eight independent corners for a generic polygon if the underlying perspective transformation only supports four source corners.

Define clearly how the additional midpoint controls affect the final boundary.

A recommended implementation is:

```text
8-point UI polygon
       ↓
Boundary refinement
       ↓
Derive effective document quadrilateral
       ↓
Perspective transformation
```

If the existing image-processing library supports arbitrary polygon warping, use it instead.

---

# 4.4 Magnifier-Based Alignment

When the user adjusts a crop point:

* Display a magnified view around the selected point.
* Keep the magnifier synchronized with the finger/mouse position.
* Update the crop boundary in real time.

## Interaction

```text
User presses crop point
        ↓
Magnifier appears
        ↓
User drags point
        ↓
Magnified region follows pointer
        ↓
Crop boundary updates
```

Support pinch-to-zoom if the platform supports multi-touch interaction.

The magnifier must not permanently obscure the document.

---

# 4.5 Smart Enhancement Engine

Implement a centralized image-enhancement pipeline.

The engine should support:

1. Shadow removal
2. Sharpness enhancement
3. Contrast enhancement
4. Text visibility enhancement
5. Background-noise reduction
6. Compression optimization

The processing pipeline should be configurable.

Example conceptual interface:

```text
SmartEnhancer.enhance(
    image,
    mode,
    qualityProfile
)
```

Do not hard-code enhancement operations directly into the UI.

---

# 4.6 Compression Profiles

Add three compression profiles:

```text
High Quality
Balanced
Small Size
```

The exact internal compression parameters should be configurable rather than scattered throughout the codebase.

Example:

```text
High Quality
    ↓
Minimal compression
Maximum readability

Balanced
    ↓
Moderate compression
Good readability / size

Small Size
    ↓
Higher compression
Reduced file size
```

Before generating the final PDF:

* Apply the selected profile.
* Estimate the resulting file size.
* Display the estimated size to the user.

Example:

```text
Quality: Balanced
Estimated size: ~2.4 MB
```

The estimate does not need to be exact but should be reasonably representative.

---

# 4.7 Manual Image Adjustments

Add the following controls to the review screen:

```text
Brightness
Contrast
Sharpness
Exposure
```

## Requirements

* Changes should be previewed immediately.
* Controls should be reversible.
* Original image must remain recoverable.
* Avoid destructive editing until the user confirms the final image.

Recommended architecture:

```text
Original Image
      ↓
Adjustment State
      ↓
Preview Renderer
      ↓
Final Render
```

Do not repeatedly modify the same image destructively when the user moves a slider.

---

# 4.8 Auto Capture

Add:

```text
Auto Capture: ON / OFF
```

## When ON

The system should:

1. Detect a document.
2. Verify that the document is sufficiently visible.
3. Verify that the device/document is sufficiently stable.
4. Verify that the image quality is acceptable.
5. Capture automatically.

## Stability

Do not trigger capture from a single frame.

Use multiple consecutive frames or an equivalent stability mechanism.

Conceptually:

```text
Document detected
       ↓
Stable for required duration
       ↓
Quality acceptable
       ↓
Capture
```

## Prevent duplicate capture

After capturing:

* Temporarily disable automatic capture.
* Prevent repeated captures from the same stable frame.
* Re-enable capture when appropriate.

---

# 4.9 Scan Modes

Add the following scan modes:

```text
Document
Book
ID Card
Passport
Whiteboard
Photograph
```

Each mode should have a configuration/profile.

Example:

```text
ScanModeConfig

edgeDetection
ocrEnabled
enhancementProfile
compressionProfile
orientationRules
qualityThreshold
```

## Document

Optimize for normal documents and text.

## Book

Account for:

* Page curvature
* Central spine
* Two-page layouts where supported

Avoid aggressive cropping that removes book content.

## ID Card

Optimize for:

* Small documents
* High text clarity
* Accurate boundary detection

## Passport

Optimize for:

* Passport page dimensions
* Text regions
* OCR

## Whiteboard

Optimize for:

* Perspective distortion
* Glare
* Background cleanup
* Text contrast

## Photograph

Do not aggressively apply document-style processing.

Preserve photographic appearance.

---

# 4.10 Blur and Quality Validation

Implement a quality-validation service.

The validator should evaluate:

```text
Motion Blur
Out-of-Focus Blur
Noise
Readability
```

The result should be represented structurally rather than as a single boolean.

Example:

```text
QualityResult

isAcceptable
blurScore
focusScore
noiseScore
readabilityScore
reason
```

## Validation timing

Quality validation should occur:

1. Before Auto Capture
2. After capture
3. Before final document generation

Do not block the user unnecessarily if the quality is borderline.

Define configurable thresholds.

---

# 4.11 Quality Error Handling

If the image is below the configured quality threshold, display:

> The captured document is unclear. Please retake the image for better readability.

Where possible, provide a more specific reason:

```text
Image appears blurry.
Please hold the device steady.

Document is too dark.
Move to a brighter area.

Document is too far away.
Move closer.
```

Avoid displaying technical terminology such as:

```text
Laplacian variance = 31.2
```

to end users.

---

# 4.12 Smart Document Processing

Create a high-level processing pipeline:

```text
Detect Document
       ↓
Auto Crop
       ↓
Auto Rotate
       ↓
Auto Enhance
       ↓
Quality Validation
       ↓
OCR
       ↓
Searchable PDF
```

The pipeline should be reusable for both:

* Single-page scans
* Multi-page documents

---

# 4.13 OCR

Improve the OCR workflow.

OCR should operate on the best available processed image rather than the raw camera image.

Pipeline:

```text
Raw Image
    ↓
Orientation Correction
    ↓
Perspective Correction
    ↓
Enhancement
    ↓
OCR Preprocessing
    ↓
OCR Engine
    ↓
Extracted Text
```

Store OCR results in a structured representation.

Example:

```text
OCRDocument
 ├── pages
 │    ├── pageImage
 │    ├── text
 │    └── textRegions
 └── metadata
```

---

# 4.14 OCR User Functions

After OCR processing, provide:

* Copy extracted text
* Edit extracted text
* Share extracted text
* Search within scanned document

The original OCR output should be preserved separately from user-edited text.

This allows the user to revert edits if necessary.

---

# 4.15 Searchable PDF

Generate PDFs containing:

* Original/processed page image
* OCR text layer

The text layer should be positioned approximately over the corresponding document regions so that:

* Text can be selected.
* Text can be searched.
* PDF remains visually identical to the scanned page.

If the existing PDF library supports invisible OCR text layers, use that mechanism.

---

# 4.16 Existing PDF Modification

Users must be able to import an existing PDF and modify it.

Supported operations:

```text
Import PDF
Add scanned page
Add gallery image
Delete page
Reorder page
Rotate page
Save updated PDF
```

## PDF Editor

Display pages as thumbnails.

Recommended UI:

```text
┌─────────────────────────────┐
│        PDF Preview          │
├─────────────────────────────┤
│ Page 1   Page 2   Page 3    │
│                             │
│ Page 4   Page 5   + Add     │
└─────────────────────────────┘
```

Each page should have actions such as:

```text
Rotate
Delete
Move
```

Reordering should support drag-and-drop where supported.

---

# 5. UI/UX Implementation

# 5.1 Simplified Scan Journey

The preferred user journey is:

```text
Scanner
   ↓
Capture
   ↓
Review
   ↓
Edit
   ↓
OCR / Process
   ↓
Save / Share
```

Avoid unnecessary intermediate screens.

---

# 5.2 Live Scanning Guidance

Display contextual guidance during camera capture.

Possible states:

```text
Searching for document...

Document detected

Move closer

Hold device steady

Low light detected

Document is ready

Blurry image detected
```

The message must be derived from the current scanner state rather than randomly displayed.

Use a state model similar to:

```text
ScannerStatus

SEARCHING
DOCUMENT_DETECTED
TOO_FAR
LOW_LIGHT
UNSTABLE
BLURRY
READY
CAPTURED
```

---

# 5.3 Smart Review Screen

After capture, show:

```text
Document Preview
```

with actions:

```text
Auto Fix
Crop
Rotate
Filters
Brightness
Contrast
Sharpness
Exposure
```

The screen should make the primary action obvious.

---

# 5.4 Auto Fix

Implement a single Auto Fix action.

Auto Fix should execute:

```text
Auto Crop
    ↓
Auto Rotation
    ↓
Auto Enhancement
    ↓
OCR Optimization
```

The user should not have to manually perform each operation.

Auto Fix should be repeatable without progressively degrading the image.

---

# 6. State Management

Avoid coupling UI state with image-processing state.

Recommended conceptual separation:

```text
ScannerState
    cameraState
    detectionState
    captureState
    qualityState

DocumentState
    pages
    selectedPage
    crop
    rotation
    adjustments

ProcessingState
    enhancement
    ocr
    pdfGeneration

PDFState
    importedPdf
    pages
    selectedPage
    saveState
```

Use immutable or safely-managed state where appropriate.

---

# 7. Error Handling

Every processing stage must have explicit failure handling.

Examples:

```text
Camera unavailable
Permission denied
Document not detected
Invalid crop
Image processing failed
OCR failed
PDF generation failed
PDF import failed
Unsupported PDF
Insufficient storage
```

Errors should:

1. Be logged for debugging.
2. Provide user-friendly messaging.
3. Avoid crashing the application.
4. Allow recovery whenever possible.

---

# 8. Performance Requirements

Image processing can be computationally expensive.

Follow these rules:

### Camera preview

Use downscaled frames.

### Final processing

Use the highest practical resolution.

### UI thread

Do not perform heavy image processing synchronously on the UI thread.

Use background workers/isolates/threads according to the application's platform.

### Memory

Release intermediate image buffers when they are no longer required.

Avoid keeping multiple full-resolution copies of every intermediate processing stage in memory.

For multi-page documents, use memory-efficient page handling.

---

# 9. Data and File Management

Use temporary files for intermediate processing when appropriate.

Recommended conceptual lifecycle:

```text
Captured Image
      ↓
Temporary Processing File
      ↓
Enhanced Image
      ↓
OCR Result
      ↓
PDF
      ↓
Final User File
```

Temporary files should be cleaned up when processing completes or fails.

Do not leave large temporary image files indefinitely.

---

# 10. Backward Compatibility

Existing users must continue to be able to:

* Capture documents manually.
* Crop documents.
* Save scans.
* Generate PDFs.
* Use existing scanner functionality.

New functionality should be introduced without breaking existing workflows.

If behavior changes intentionally, document the change in code comments/release notes.

---

# 11. Configuration

Avoid hard-coding algorithm thresholds.

Centralize configurable values such as:

```text
Blur threshold
Readability threshold
Stability duration
Document detection confidence
Brightness limits
Contrast limits
Compression quality
OCR settings
Maximum image resolution
```

Example:

```text
ScannerConfig

documentDetectionThreshold
blurThreshold
readabilityThreshold
stabilityDuration
compressionProfiles
enhancementProfiles
```

This will allow future tuning without modifying business logic.

---

# 12. Testing Requirements

Implement tests for every major feature.

## Unit Tests

At minimum:

### Orientation

* Portrait image
* Landscape image
* Already-correct orientation
* Incorrect orientation

### Document Detection

* Clear document
* Complex background
* Low-light image
* Partial document

### Crop

* Four-corner compatibility
* Eight-point adjustment
* Invalid polygon
* Extremely small crop

### Quality

* Sharp image
* Motion blur
* Out-of-focus image
* Noisy image
* Dark image

### Compression

* High quality
* Balanced
* Small size

### OCR

* Clear text
* Rotated text
* Low contrast text

### PDF

* Import
* Add page
* Delete page
* Reorder page
* Rotate page
* Save PDF

---

# 13. Integration Tests

Test complete workflows.

## Workflow 1 — Standard Scan

```text
Open Scanner
→ Detect Document
→ Capture
→ Auto Crop
→ Enhance
→ OCR
→ Generate PDF
```

## Workflow 2 — Manual Capture

```text
Auto Capture OFF
→ Manual Capture
→ Review
→ Edit
→ Save
```

## Workflow 3 — Poor Quality

```text
Capture blurry image
→ Quality Validation
→ Warning
→ Retake
```

## Workflow 4 — PDF Editing

```text
Import PDF
→ Add scanned page
→ Add image
→ Reorder
→ Delete
→ Rotate
→ Save
```

---

# 14. UI Testing

Verify:

* Scanner controls are accessible.
* Guidance messages appear at correct states.
* Crop handles are draggable.
* Magnifier follows selected crop point.
* Sliders update preview.
* Auto Fix produces expected results.
* PDF thumbnails reorder correctly.
* Buttons remain usable on small screens.
* Long documents do not break layout.

---

# 15. Accessibility

Ensure:

* Buttons have accessible labels.
* Icons are not the only indication of functionality.
* Text has sufficient contrast.
* Touch targets are sufficiently large.
* Guidance messages are readable.
* Important quality errors are communicated without relying solely on color.

---

# 16. Logging and Diagnostics

Add structured logging around expensive or failure-prone operations.

Useful events:

```text
SCAN_STARTED
DOCUMENT_DETECTED
AUTO_CAPTURE_TRIGGERED
IMAGE_CAPTURED
QUALITY_CHECK_FAILED
IMAGE_ENHANCEMENT_STARTED
IMAGE_ENHANCEMENT_COMPLETED
OCR_STARTED
OCR_COMPLETED
PDF_GENERATION_STARTED
PDF_GENERATION_COMPLETED
PDF_IMPORT_FAILED
```

Do not log sensitive document contents or extracted OCR text unless explicitly permitted by the application's privacy requirements.

---

# 17. Privacy and Security

Scanned documents and OCR output may contain sensitive information.

Therefore:

* Do not transmit images externally unless required by the existing OCR architecture.
* Do not log document images.
* Do not log OCR text.
* Delete temporary files when no longer required.
* Follow the application's existing storage/security model.
* Request only necessary permissions.

---

# 18. Recommended Implementation Sequence

Do not implement all features simultaneously.

Implement in the following order:

## Phase 1 — Architecture

1. Inspect existing scanner architecture.
2. Identify reusable components.
3. Define processing pipeline.
4. Define scanner/document/processing state.
5. Define configuration.

## Phase 2 — Capture

6. Auto Capture
7. Stability detection
8. Orientation detection
9. Live document detection
10. User guidance

## Phase 3 — Document Processing

11. Improved corner detection
12. 8-point crop UI
13. Magnifier
14. Perspective correction
15. Auto crop
16. Quality validation

## Phase 4 — Enhancement

17. Smart Enhancement
18. Brightness
19. Contrast
20. Sharpness
21. Exposure
22. Compression profiles

## Phase 5 — OCR

23. OCR preprocessing
24. OCR extraction
25. Searchable PDF
26. Copy/edit/share OCR text
27. Search within document

## Phase 6 — PDF Management

28. PDF import
29. Add scanned pages
30. Add gallery images
31. Delete pages
32. Reorder pages
33. Rotate pages
34. Save modified PDF

## Phase 7 — UX

35. Smart Review Screen
36. Auto Fix
37. Final UI polish
38. Accessibility
39. Error-state improvements

## Phase 8 — Testing

40. Unit tests
41. Integration tests
42. UI tests
43. Performance testing
44. Regression testing

---

# 19. Definition of Done

A feature should not be considered complete merely because the UI exists.

Each feature is complete only when:

* UI is implemented.
* Business logic is implemented.
* Processing pipeline is integrated.
* Error handling exists.
* Existing functionality remains intact.
* Relevant tests pass.
* Performance is acceptable.
* Accessibility requirements are satisfied.
* Temporary resources are cleaned up.
* Logging is implemented where appropriate.

---

# 20. Coding Agent Execution Instructions

Before writing code:

### Step 1 — Inspect

Inspect the complete repository structure and identify the existing implementation for:

```text
Scanner
Camera
Image Processing
Crop
OCR
PDF
Navigation
State Management
Tests
```

Do not make assumptions about the technology stack.

### Step 2 — Report Architecture

Before modifying substantial code, provide a concise implementation plan containing:

```text
Existing architecture
Relevant files
Components to modify
New components/services required
Dependencies required
Potential breaking changes
Testing strategy
```

### Step 3 — Implement Incrementally

Implement one logical feature group at a time.

After each feature group:

1. Build the project.
2. Run relevant tests.
3. Fix compilation errors.
4. Fix regressions.
5. Review integration with the existing scanner.

### Step 4 — Avoid Unnecessary Rewrites

Do NOT:

* Rewrite the entire scanner.
* Replace working libraries without reason.
* Change unrelated UI.
* Rename large numbers of existing classes/files unnecessarily.
* Introduce duplicate image-processing pipelines.
* Duplicate OCR/PDF logic.

Prefer incremental modification.

### Step 5 — Validate End-to-End

After implementation, verify the complete flow:

```text
Camera
 ↓
Detection
 ↓
Auto Capture
 ↓
Orientation
 ↓
Crop
 ↓
Quality
 ↓
Enhancement
 ↓
OCR
 ↓
Searchable PDF
 ↓
PDF Editing
 ↓
Save / Share
```

### Step 6 — Final Report

At completion, provide:

```text
Implemented Features
Modified Files
New Files
Dependencies Added
Database/Storage Changes
Known Limitations
Tests Added
Tests Passed
Performance Considerations
Remaining Work
```

Do not claim a feature is implemented unless it is actually integrated into the user-facing workflow.

---

# 21. Priority Matrix

| Priority | Feature                                        |
| -------- | ---------------------------------------------- |
| P0       | Existing scanner stability / regression safety |
| P0       | Document detection                             |
| P0       | Auto capture                                   |
| P0       | Auto rotation                                  |
| P0       | Auto crop                                      |
| P0       | Quality validation                             |
| P0       | Smart enhancement                              |
| P0       | OCR                                            |
| P0       | Searchable PDF                                 |
| P1       | 8-point alignment                              |
| P1       | Magnifier                                      |
| P1       | Brightness / Contrast / Sharpness / Exposure   |
| P1       | Compression profiles                           |
| P1       | Scan modes                                     |
| P1       | PDF modification                               |
| P1       | Smart Review                                   |
| P1       | Auto Fix                                       |
| P2       | Advanced guidance refinements                  |
| P2       | Additional UX polish                           |

---

# 22. Final Engineering Principle

The objective is not simply to add a collection of buttons and screens.

The objective is to create a reliable document-processing pipeline in which:

**Capture → Detect → Validate → Correct → Enhance → OCR → Manage → Export**

works as one coherent system.

Prioritize:

1. Correctness
2. Reliability
3. Image/OCR quality
4. Performance
5. Maintainability
6. User experience

Any algorithm or library introduced should be evaluated against the existing implementation before adoption. Prefer stable, maintainable solutions over unnecessarily complex implementations.
