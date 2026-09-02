/**
 * Auto Capture Manager
 * Orchestrates automatic document capture based on stability and quality
 */

class AutoCaptureManager {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.enabled = false;
    this.isCapturing = false;
    this.lastCaptureTime = 0;
    this.captureDebounce = 500; // ms - prevent duplicate captures
    this.stabilityDetector = new StabilityDetector(config);
    this.qualityValidator = new QualityValidator(config);
    this.onCaptureCallback = null;
    this.onStatusChangeCallback = null;
    this.currentStatus = "IDLE";
  }

  /**
   * Enable auto capture
   */
  enable() {
    this.enabled = true;
    this.setStatus("SEARCHING");
  }

  /**
   * Disable auto capture
   */
  disable() {
    this.enabled = false;
    this.stabilityDetector.reset();
    this.setStatus("IDLE");
  }

  /**
   * Toggle auto capture on/off
   */
  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Process a frame from the camera
   * @param {HTMLCanvasElement} canvas - Camera frame
   * @param {Array} detectedCorners - Detected document corners
   * @param {number} detectionConfidence - Detection confidence 0-1
   * @returns {Promise<{shouldCapture, reason, status}>}
   */
  async processFrame(canvas, detectedCorners, detectionConfidence) {
    if (!this.enabled || this.isCapturing) {
      return { shouldCapture: false, reason: "Auto capture disabled or already capturing" };
    }

    // Check debounce
    if (Date.now() - this.lastCaptureTime < this.captureDebounce) {
      return { shouldCapture: false, reason: "Capture debounce active" };
    }

    try {
      // Check document detection
      if (!detectedCorners || detectionConfidence < this.config.documentDetection.minConfidence) {
        this.setStatus("SEARCHING");
        this.stabilityDetector.reset();
        return { shouldCapture: false, reason: "No document detected" };
      }

      this.setStatus("DOCUMENT_DETECTED");

      // Record frame for stability tracking
      const stabilityResult = this.stabilityDetector.recordFrame(
        detectedCorners,
        detectionConfidence
      );

      if (!stabilityResult.isStable) {
        this.setStatus("UNSTABLE");
        return {
          shouldCapture: false,
          reason: `Waiting for stability (${stabilityResult.framesRecorded}/${stabilityResult.score.toFixed(2)})`,
        };
      }

      this.setStatus("STABLE");

      // Check image quality
      const qualityResult = this.qualityValidator.validateImage(canvas);

      if (!qualityResult.isAcceptable) {
        const scanMode = this.config.scanModes.document || {};
        const qualityThreshold = scanMode.qualityThreshold || 0.7;

        if (qualityResult.readabilityScore < qualityThreshold) {
          this.setStatus("BLURRY");
          return {
            shouldCapture: false,
            reason: `Image quality below threshold (readability: ${qualityResult.readabilityScore.toFixed(2)})`,
            quality: qualityResult,
          };
        }
      }

      this.setStatus("READY");

      // All checks passed - capture!
      return {
        shouldCapture: true,
        reason: "All conditions met for auto-capture",
        quality: qualityResult,
        stability: stabilityResult,
      };
    } catch (e) {
      console.error("Auto capture frame processing error:", e);
      return { shouldCapture: false, reason: "Processing error: " + e.message };
    }
  }

  /**
   * Execute capture and apply debounce
   */
  async capture() {
    if (this.isCapturing) return false;
    
    this.isCapturing = true;
    this.lastCaptureTime = Date.now();
    this.setStatus("CAPTURED");

    if (this.onCaptureCallback) {
      try {
        await this.onCaptureCallback();
      } catch (e) {
        console.error("Capture callback error:", e);
      }
    }

    // Re-enable capture after debounce period
    setTimeout(() => {
      this.isCapturing = false;
      if (this.enabled) {
        this.stabilityDetector.reset();
        this.setStatus("SEARCHING");
      }
    }, this.captureDebounce);

    return true;
  }

  /**
   * Set auto capture status and notify listeners
   * @private
   */
  setStatus(status) {
    this.currentStatus = status;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status);
    }
  }

  /**
   * Get user-friendly status message
   */
  getStatusMessage() {
    const messages = {
      IDLE: "Auto capture is off",
      SEARCHING: "Searching for document…",
      DOCUMENT_DETECTED: "Document detected",
      UNSTABLE: "Hold steady…",
      LOW_LIGHT: "Move to brighter area",
      STABLE: "Document is stable",
      BLURRY: "Image appears blurry. Please hold steady.",
      READY: "Document ready. Taking photo…",
      CAPTURED: "Photo captured",
    };
    return messages[this.currentStatus] || "Auto capture ready";
  }

  /**
   * Register callback for auto-capture trigger
   */
  setOnCapture(callback) {
    this.onCaptureCallback = callback;
  }

  /**
   * Register callback for status changes
   */
  setOnStatusChange(callback) {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.currentStatus;
  }
}
