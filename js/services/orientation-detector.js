/**
 * Orientation Detection and Correction Service
 * Automatically detects document orientation and rotates if needed
 */

class OrientationDetector {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
  }

  /**
   * Detect if document is portrait or landscape and if rotation is needed
   * @param {HTMLCanvasElement} canvas - Canvas containing the document image
   * @param {number} expectedOrientation - Expected orientation ("portrait" or "landscape")
   * @returns {OrientationResult}
   */
  detectOrientation(canvas, expectedOrientation = "portrait") {
    if (!this.config.orientation.autoDetectEnabled) {
      return new OrientationResult(
        expectedOrientation,
        1.0,
        false,
        0
      );
    }

    try {
      // Check physical dimensions
      const isPhysicallyLandscape = canvas.width > canvas.height;
      const expectedLandscape = expectedOrientation === "landscape";

      if (isPhysicallyLandscape === expectedLandscape) {
        // Already correctly oriented
        return new OrientationResult(expectedOrientation, 0.95, false, 0);
      }

      // A horizontal/vertical edge count cannot distinguish the page's intended
      // orientation from the canvas orientation.  That used to make a sideways
      // portrait page look "correct" and prevented auto-rotation.  Use the
      // expected orientation for this decision; dimensions are reliable for a
      // 90-degree correction (but deliberately do not guess 180 degrees).
      const detectedOrientation = isPhysicallyLandscape ? "landscape" : "portrait";
      const needsRotation = detectedOrientation !== expectedOrientation;

      return new OrientationResult(
        detectedOrientation,
        0.95,
        needsRotation,
        needsRotation ? 90 : 0
      );
    } catch (e) {
      console.warn("Orientation detection failed:", e);
      return new OrientationResult(expectedOrientation, 0, false, 0);
    }
  }

  /**
   * Detect text orientation by analyzing horizontal/vertical edge density
   * @param {HTMLCanvasElement} canvas
   * @returns {Object|null} - {orientation, confidence, needsRotation, angle}
   */
  detectTextOrientation(canvas) {
    try {
      if (!window.cv) return null;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Convert to grayscale and detect edges
      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const edges = new cv.Mat();

      try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.Canny(gray, edges, 50, 150);

        // Count horizontal vs vertical edges
        const data = new Uint8ClampedArray(edges.data);
        let horizontalEdges = 0;
        let verticalEdges = 0;

        const width = edges.cols;
        const height = edges.rows;

        // Sample horizontal lines (more horizontal edges = landscape)
        for (let y = 0; y < height; y += 10) {
          for (let x = 0; x < width - 1; x += 10) {
            if (data[y * width + x] > 0 && data[y * width + (x + 1)] > 0) {
              horizontalEdges++;
            }
          }
        }

        // Sample vertical lines (more vertical edges = portrait)
        for (let x = 0; x < width; x += 10) {
          for (let y = 0; y < height - 1; y += 10) {
            if (data[y * width + x] > 0 && data[(y + 1) * width + x] > 0) {
              verticalEdges++;
            }
          }
        }

        const ratio = horizontalEdges / (verticalEdges + 1); // +1 to avoid divide by 0

        // If more horizontal edges, likely landscape
        const isLandscape = ratio > 1.2;
        const confidence = Math.min(1, Math.abs(ratio - 1) / 2); // Confidence based on how clear the difference is

        const canvasIsLandscape = canvas.width > canvas.height;
        const needsRotation = isLandscape !== canvasIsLandscape;

        return {
          orientation: isLandscape ? "landscape" : "portrait",
          confidence: Math.max(0.5, confidence),
          needsRotation,
          angle: needsRotation ? 90 : 0,
        };
      } finally {
        src.delete();
        gray.delete();
        edges.delete();
      }
    } catch (e) {
      console.warn("Text orientation detection failed:", e);
      return null;
    }
  }

  /**
   * Apply rotation to an image canvas
   * @param {HTMLCanvasElement} sourceCanvas - Source image canvas
   * @param {number} angle - Rotation angle in degrees (90, 180, 270)
   * @returns {Promise<HTMLCanvasElement>} - Rotated canvas
   */
  async rotateCanvas(sourceCanvas, angle) {
    const normalizedAngle = ((angle % 360) + 360) % 360; // Normalize to 0-359

    if (normalizedAngle === 0) {
      return sourceCanvas;
    }

    const isSwapDimensions = normalizedAngle === 90 || normalizedAngle === 270;
    const outputWidth = isSwapDimensions
      ? sourceCanvas.height
      : sourceCanvas.width;
    const outputHeight = isSwapDimensions
      ? sourceCanvas.width
      : sourceCanvas.height;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;

    const ctx = outputCanvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    ctx.translate(outputWidth / 2, outputHeight / 2);
    ctx.rotate((normalizedAngle * Math.PI) / 180);
    ctx.drawImage(
      sourceCanvas,
      -sourceCanvas.width / 2,
      -sourceCanvas.height / 2
    );

    return outputCanvas;
  }

  /**
   * Calculate new dimensions after rotation
   * @param {number} width
   * @param {number} height
   * @param {number} angle
   * @returns {Object} - {w, h}
   */
  getRotatedDimensions(width, height, angle) {
    const normalizedAngle = ((angle % 360) + 360) % 360;
    return normalizedAngle % 180 === 0
      ? { w: width, h: height }
      : { w: height, h: width };
  }

  /**
   * Get user-friendly error message for orientation issues
   * @param {OrientationResult} result
   * @returns {string}
   */
  getErrorMessage(result) {
    if (result.confidence < 0.3) {
      return "Unable to determine document orientation. Please review the image.";
    }
    return `Document is ${result.detectedOrientation}. ${result.requiresRotation ? "Rotating to correct orientation." : ""}`;
  }
}
