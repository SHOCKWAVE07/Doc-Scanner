/**
 * State Models and Management
 * Structured state containers for the scanner application
 */

/**
 * Logger Service - Structured logging throughout the application
 */
class Logger {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
  }

  log(event, data = {}) {
    if (!this.config.logging.enabled) return;
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, event, ...data };
    if (console[this.config.logging.level] || console.log) {
      console[this.config.logging.level || "log"](event, logEntry);
    }
  }

  debug(event, data) {
    this.log(event, data);
  }
  info(event, data) {
    this.log(event, data);
  }
  warn(event, data) {
    this.log(event, data);
  }
  error(event, data) {
    this.log(event, data);
  }
}

/**
 * Scanner State - Tracks camera and detection state
 */
class ScannerState {
  constructor() {
    this.status = "IDLE"; // SEARCHING, DOCUMENT_DETECTED, UNSTABLE, LOW_LIGHT, READY, BLURRY, CAPTURED
    this.isStreaming = false;
    this.detectionConfidence = 0;
    this.detectedCorners = [];
    this.stabilityScore = 0;
    this.qualityScore = { blur: 0, focus: 0, noise: 0, readability: 0 };
    this.autoCaptureTriggerTime = null;
    this.lastFrameTime = null;
  }

  reset() {
    this.status = "IDLE";
    this.isStreaming = false;
    this.detectionConfidence = 0;
    this.detectedCorners = [];
    this.stabilityScore = 0;
    this.qualityScore = { blur: 0, focus: 0, noise: 0, readability: 0 };
    this.autoCaptureTriggerTime = null;
  }
}

/**
 * Document State - Tracks active document being edited
 */
class DocumentState {
  constructor() {
    this.originalImage = null;
    this.originalImageURL = null;
    this.fileName = "";
    this.sourceWidth = 0;
    this.sourceHeight = 0;
    this.corners = [];
    this.detectedCorners = [];
    this.rotation = 0;
    this.adjustments = {
      brightness: 0,
      contrast: 0,
      sharpness: 0,
      exposure: 0,
    };
    this.cropRegion = null;
    this.pendingOptimized = null;
  }

  reset() {
    if (this.originalImageURL) {
      URL.revokeObjectURL(this.originalImageURL);
    }
    this.originalImage = null;
    this.originalImageURL = null;
    this.fileName = "";
    this.sourceWidth = 0;
    this.sourceHeight = 0;
    this.corners = [];
    this.detectedCorners = [];
    this.rotation = 0;
    this.adjustments = { brightness: 0, contrast: 0, sharpness: 0, exposure: 0 };
    this.cropRegion = null;
    this.pendingOptimized = null;
  }

  setOriginalImage(image, imageURL, fileName) {
    this.originalImage = image;
    this.originalImageURL = imageURL;
    this.fileName = fileName;
    this.sourceWidth = image.naturalWidth;
    this.sourceHeight = image.naturalHeight;
  }
}

/**
 * Page Object - Represents a scanned page
 */
class ScannedPage {
  constructor(id, blob, url, width, height, fileName) {
    this.id = id;
    this.blob = blob;
    this.url = url;
    this.width = width;
    this.height = height;
    this.rotation = 0;
    this.name = fileName;
    this.originalSize = blob.size;
    this.compressedSize = blob.size;
    this.ocrData = null;
    this.scanMode = "document";
    this.qualityScore = { blur: 0, focus: 0, noise: 0, readability: 0 };
    this.metadata = {
      capturedAt: new Date().toISOString(),
      autoDetected: false,
      autoRotated: false,
      enhanced: false,
    };
  }

  rotatedDimensions() {
    return this.rotation % 180 === 0
      ? { w: this.width, h: this.height }
      : { w: this.height, h: this.width };
  }
}

/**
 * Processing State - Tracks ongoing image processing operations
 */
class ProcessingState {
  constructor() {
    this.isProcessing = false;
    this.currentOperation = ""; // "detect", "enhance", "ocr", "compress", etc.
    this.progress = 0;
    this.estimatedSize = null;
    this.operationStartTime = null;
    this.errors = [];
  }

  startOperation(operation) {
    this.isProcessing = true;
    this.currentOperation = operation;
    this.progress = 0;
    this.operationStartTime = Date.now();
    this.errors = [];
  }

  completeOperation() {
    this.isProcessing = false;
    this.currentOperation = "";
    this.progress = 0;
  }

  addError(error) {
    this.errors.push({
      operation: this.currentOperation,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * PDF State - Tracks PDF import and editing state
 */
class PDFState {
  constructor() {
    this.importedPDF = null;
    this.pdfPages = [];
    this.selectedPageIndex = -1;
    this.isEditMode = false;
    this.isDirty = false;
  }

  reset() {
    this.importedPDF = null;
    this.pdfPages = [];
    this.selectedPageIndex = -1;
    this.isEditMode = false;
    this.isDirty = false;
  }
}

/**
 * Global Application State
 */
class ApplicationState {
  constructor() {
    this.scanner = new ScannerState();
    this.document = new DocumentState();
    this.processing = new ProcessingState();
    this.pdf = new PDFState();
    this.pages = [];
    this.fileQueue = [];
    this.currentScanMode = "document";
    this.autoCapture = false;
    this.autoRotate = true;
    this.compressionProfile = "balanced";
  }

  reset() {
    this.scanner.reset();
    this.document.reset();
    this.processing.completeOperation();
    this.pdf.reset();
    this.pages = [];
    this.fileQueue = [];
  }
}

// Quality Result - Returned by quality validator
class QualityResult {
  constructor(
    isAcceptable,
    blurScore = 0,
    focusScore = 0,
    noiseScore = 0,
    readabilityScore = 0,
    reason = ""
  ) {
    this.isAcceptable = isAcceptable;
    this.blurScore = blurScore;
    this.focusScore = focusScore;
    this.noiseScore = noiseScore;
    this.readabilityScore = readabilityScore;
    this.reason = reason;
  }

  getDetailedReason() {
    const reasons = [];
    if (this.blurScore < 0.4) reasons.push("Image appears blurry");
    if (this.focusScore < 0.4) reasons.push("Image appears out of focus");
    if (this.noiseScore > 0.6) reasons.push("Image is very noisy");
    if (this.readabilityScore < 0.4) reasons.push("Document text is not clear");
    return reasons.length > 0 ? reasons.join(". ") : this.reason;
  }
}

// Orientation Result - Returned by orientation detector
class OrientationResult {
  constructor(
    detectedOrientation = "portrait",
    confidence = 0,
    requiresRotation = false,
    rotationAngle = 0
  ) {
    this.detectedOrientation = detectedOrientation; // "portrait", "landscape"
    this.confidence = confidence; // 0-1
    this.requiresRotation = requiresRotation;
    this.rotationAngle = rotationAngle; // degrees to rotate
  }
}

// Document Detection Result
class DetectionResult {
  constructor(
    isDetected = false,
    corners = [],
    confidence = 0,
    quality = "unknown",
    reason = ""
  ) {
    this.isDetected = isDetected;
    this.corners = corners; // [{x, y}, ...]
    this.confidence = confidence; // 0-1
    this.quality = quality; // "excellent", "good", "fair", "poor"
    this.reason = reason;
  }
}

// Export classes for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    Logger,
    ScannerState,
    DocumentState,
    ScannedPage,
    ProcessingState,
    PDFState,
    ApplicationState,
    QualityResult,
    OrientationResult,
    DetectionResult,
  };
}
