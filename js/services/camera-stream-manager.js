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
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live camera requires HTTPS or localhost in a supported browser.");
      }

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
          const maxWidth = this.config.imageProcessing.maxPreviewResolution || 1024;
          const scale = Math.min(1, maxWidth / this.videoElement.videoWidth);
          this.previewCanvas.width = Math.max(1, Math.round(this.videoElement.videoWidth * scale));
          this.previewCanvas.height = Math.max(1, Math.round(this.videoElement.videoHeight * scale));
          this.videoElement.play().catch(() => {});
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
    if (!this.scanner || !window.cv) {
      return { corners: null, confidence: 0 };
    }

    // jscanify expects an OpenCV Mat, whereas the camera preview is an HTML
    // canvas. Passing the canvas directly throws and previously prevented the
    // fallback detector from running as well.
    let source = null;
    let contour = null;
    try {
      source = cv.imread(canvas);
      contour = this.scanner.findPaperContour(source);

      if (contour && !contour.empty()) {
        const points = this.scanner.getCornerPoints(contour);
        const corners = this.orderCorners([
          points.topLeftCorner,
          points.topRightCorner,
          points.bottomRightCorner,
          points.bottomLeftCorner,
        ]);
        const confidence = this.getQuadrilateralConfidence(corners, canvas);
        if (confidence >= this.config.documentDetection.minConfidence) {
          return { corners, confidence };
        }
      }
    } catch (e) {
      // A jscanify failure should not disable the OpenCV fallback path.
      console.warn("Primary document detection error:", e);
    } finally {
      if (contour) contour.delete();
      if (source) source.delete();
    }

    // Fallback: edge-based detection. Keep it outside the primary try/catch
    // so a primary-detector error cannot skip it.
    const fallbackCorners = this.fallbackContourCorners(canvas);
    if (fallbackCorners) {
      const confidence = this.getQuadrilateralConfidence(fallbackCorners, canvas);
      if (confidence >= this.config.documentDetection.minConfidence) {
        return { corners: fallbackCorners, confidence };
      }
    }

    return { corners: null, confidence: 0 };
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
    if (!quad || quad.length !== 4) return 0;
    // Shoelace formula
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      area += quad[i].x * quad[next].y - quad[next].x * quad[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Score a detected contour as a document-shaped quadrilateral. This rejects
   * large but irregular contours (hands, tables, screens) before they reach
   * the auto-capture stability check.
   * @private
   */
  getQuadrilateralConfidence(corners, canvas) {
    if (!corners || corners.length !== 4) return 0;

    const areaRatio = this.calculateQuadArea(corners) / (canvas.width * canvas.height);
    if (areaRatio < this.config.documentDetection.minAreaRatio || !this.isConvex(corners)) {
      return 0;
    }

    const sides = corners.map((point, index) => {
      const next = corners[(index + 1) % 4];
      return Math.hypot(next.x - point.x, next.y - point.y);
    });
    const sideRatio = Math.min(...sides) / Math.max(...sides);
    if (sideRatio < this.config.documentDetection.minSideRatio) return 0;

    const angles = corners.map((point, index) => {
      const previous = corners[(index + 3) % 4];
      const next = corners[(index + 1) % 4];
      const a = { x: previous.x - point.x, y: previous.y - point.y };
      const b = { x: next.x - point.x, y: next.y - point.y };
      const cosine = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
      return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
    });
    const minAngle = this.config.documentDetection.minCornerAngle;
    const maxAngle = this.config.documentDetection.maxCornerAngle;
    if (angles.some((angle) => angle < minAngle || angle > maxAngle)) return 0;

    const areaScore = Math.min(1, areaRatio / 0.35);
    const angleScore = 1 - Math.min(1, angles.reduce((sum, angle) => sum + Math.abs(angle - 90), 0) / (4 * 48));
    const sideScore = Math.min(1, sideRatio / 0.45);
    return Math.max(0, Math.min(1, 0.45 + areaScore * 0.2 + angleScore * 0.2 + sideScore * 0.15));
  }

  isConvex(corners) {
    let direction = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const c = corners[(i + 2) % 4];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cross === 0) return false;
      const nextDirection = Math.sign(cross);
      if (direction && nextDirection !== direction) return false;
      direction = nextDirection;
    }
    return true;
  }

  /** Capture a fresh frame only when auto-capture fires. */
  captureFrame() {
    if (!this.videoElement || !this.videoElement.videoWidth) return null;
    const maxWidth = this.config.imageProcessing.maxOutputResolution || 1800;
    const scale = Math.min(1, maxWidth / this.videoElement.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(this.videoElement.videoWidth * scale);
    canvas.height = Math.round(this.videoElement.videoHeight * scale);
    canvas.getContext("2d").drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /**
   * Check if stream is active
   */
  isActive() {
    return this.isRunning;
  }
}
