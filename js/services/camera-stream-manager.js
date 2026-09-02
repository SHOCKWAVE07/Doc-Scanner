/**
 * Camera Stream Manager
 * Handles live video stream, real-time document detection, and frame processing
 */

class CameraStreamManager {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.stream = null;
    this.videoElement = null;
    this.previewCanvas = null;
    this.isRunning = false;
    this.animationFrameId = null;
    this.scanner = null;
    this.onFrameCallback = null;
    this.frameSkip = 0; // Skip every Nth frame for performance
    this.frameSkipRate = 2; // Process every 2nd frame in preview
  }

  /**
   * Initialize camera stream
   * @param {HTMLVideoElement} videoElement - Video element for preview
   * @param {HTMLCanvasElement} previewCanvas - Canvas for processing
   * @param {Object} scanner - jscanify scanner instance
   * @returns {Promise<boolean>}
   */
  async initialize(videoElement, previewCanvas, scanner) {
    try {
      this.videoElement = videoElement;
      this.previewCanvas = previewCanvas;
      this.scanner = scanner;

      // Request camera permission
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      this.videoElement.srcObject = this.stream;

      // Wait for video to be ready
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();
          resolve();
        };
      });

      return true;
    } catch (e) {
      console.error("Camera initialization failed:", e);
      if (e.name === "NotAllowedError") {
        throw new Error(
          "Camera permission denied. Please allow camera access in your browser settings."
        );
      } else if (e.name === "NotFoundError") {
        throw new Error("No camera device found on this device.");
      }
      throw e;
    }
  }

  /**
   * Start processing camera frames
   * @param {Function} onFrame - Callback for each processed frame
   */
  start(onFrame) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.onFrameCallback = onFrame;
    this.processFrame();
  }

  /**
   * Stop camera stream and frame processing
   */
  stop() {
    this.isRunning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Process a single frame from the video stream
   * @private
   */
  processFrame = () => {
    if (!this.isRunning) return;

    this.frameSkip++;

    // Only process every Nth frame to avoid CPU overload
    if (this.frameSkip % this.frameSkipRate === 0) {
      try {
        // Draw current video frame to canvas
        const ctx = this.previewCanvas.getContext("2d");
        ctx.drawImage(
          this.videoElement,
          0,
          0,
          this.previewCanvas.width,
          this.previewCanvas.height
        );

        // Detect document in frame
        const detectionResult = this.detectDocument(this.previewCanvas);

        // Callback with detection result
        if (this.onFrameCallback) {
          this.onFrameCallback({
            canvas: this.previewCanvas,
            detectedCorners: detectionResult.corners,
            confidence: detectionResult.confidence,
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        console.warn("Frame processing error:", e);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.processFrame);
  };

  /**
   * Detect document in a canvas
   * @private
   * @returns {Object} - {corners, confidence}
   */
  detectDocument(canvas) {
    if (!this.scanner) {
      return { corners: null, confidence: 0 };
    }

    try {
      // Try jscanify first
      const contour = this.scanner.findPaperContour(canvas);

      if (contour && contour.length === 4) {
        // Verify it's a valid quadrilateral
        const area = this.calculateQuadArea(contour);
        const canvasArea = canvas.width * canvas.height;
        const areaRatio = area / canvasArea;

        if (areaRatio >= this.config.documentDetection.minAreaRatio) {
          return {
            corners: this.orderCorners(contour),
            confidence: 0.85,
          };
        }
      }

      // Fallback: edge-based detection
      const fallbackCorners = this.fallbackContourCorners(canvas);
      if (fallbackCorners) {
        return {
          corners: fallbackCorners,
          confidence: 0.65,
        };
      }

      return { corners: null, confidence: 0 };
    } catch (e) {
      console.warn("Document detection error:", e);
      return { corners: null, confidence: 0 };
    }
  }

  /**
   * Fallback document detection using edge detection
   * @private
   */
  fallbackContourCorners(canvas) {
    try {
      if (!window.cv) return null;

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const blurred = new cv.Mat();

      try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.blur(gray, blurred, new cv.Size(5, 5));
        cv.Canny(blurred, edges, 50, 150);

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = 0;
        let largestContour = null;

        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);

          if (area > maxArea) {
            const epsilon = 0.02 * cv.arcLength(cnt, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, epsilon, true);

            if (approx.rows === 4) {
              maxArea = area;
              largestContour = approx;
            } else {
              approx.delete();
            }
          }
        }

        if (largestContour) {
          const corners = [];
          for (let i = 0; i < 4; i++) {
            corners.push({
              x: largestContour.data32S[i * 2],
              y: largestContour.data32S[i * 2 + 1],
            });
          }
          largestContour.delete();

          return this.orderCorners(corners);
        }

        return null;
      } finally {
        src.delete();
        gray.delete();
        edges.delete();
        blurred.delete();
        contours.delete();
        hierarchy.delete();
      }
    } catch (e) {
      console.warn("Fallback detection error:", e);
      return null;
    }
  }

  /**
   * Order corners into [TL, TR, BR, BL]
   * @private
   */
  orderCorners(corners) {
    if (!corners || corners.length !== 4) return null;

    const pts = corners.map((c) => ({ x: c.x, y: c.y }));
    const center = {
      x: pts.reduce((sum, p) => sum + p.x, 0) / 4,
      y: pts.reduce((sum, p) => sum + p.y, 0) / 4,
    };

    const ordered = pts.sort((a, b) => {
      const atan2a = Math.atan2(a.y - center.y, a.x - center.x);
      const atan2b = Math.atan2(b.y - center.y, b.x - center.x);
      return atan2a - atan2b;
    });

    return [ordered[0], ordered[1], ordered[2], ordered[3]];
  }

  /**
   * Calculate quad area
   * @private
   */
  calculateQuadArea(quad) {
    if (quad.length !== 4) return 0;
    // Shoelace formula
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      area += quad[i].x * quad[next].y - quad[next].x * quad[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Check if stream is active
   */
  isActive() {
    return this.isRunning;
  }
}
