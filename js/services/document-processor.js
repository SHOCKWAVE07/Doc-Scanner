/**
 * Document Processor Service
 * Orchestrates the complete document processing pipeline:
 * Capture → Detect → Rotate → Crop → Enhance → Validate → Compress
 */

class DocumentProcessor {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.logger = new Logger(config);
    this.qualityValidator = new QualityValidator(config);
    this.orientationDetector = new OrientationDetector(config);
    this.enhancementEngine = new EnhancementEngine(config);
    this.compressionProfiles = new CompressionProfiles(config);
  }

  /**
   * Process a captured document through the full pipeline
   * @param {HTMLCanvasElement} canvas - Source image canvas
   * @param {Array} corners - Crop corner points [{x,y}, {x,y}, {x,y}, {x,y}]
   * @param {Object} options - Processing options
   * @returns {Promise<ProcessingResult>}
   */
  async processDocument(canvas, corners, options = {}) {
    const {
      scanMode = "document",
      compressionProfile = "balanced",
      autoRotate = true,
      autoEnhance = true,
      validateQuality = true,
    } = options;

    const result = {
      success: false,
      stages: {},
      errors: [],
      warnings: [],
      metadata: {
        scanMode,
        compressionProfile,
        startTime: Date.now(),
        duration: 0,
      },
    };

    try {
      this.logger.info("Document processing started", {
        scanMode,
        compressionProfile,
      });

      // Stage 1: Orientation Detection
      if (autoRotate && this.config.orientation.autoDetectEnabled) {
        result.stages.orientation = await this.processOrientation(
          canvas,
          result
        );
        if (result.stages.orientation.applied) {
          canvas = result.stages.orientation.rotatedCanvas;
        }
      }

      // Stage 2: Perspective Correction & Cropping
      result.stages.crop = await this.processCrop(canvas, corners, result);

      // Stage 3: Enhancement
      if (autoEnhance) {
        result.stages.enhancement = await this.processEnhancement(
          result.stages.crop.mat,
          scanMode,
          result
        );
      }

      // Stage 4: Quality Validation
      if (validateQuality) {
        result.stages.quality = await this.processQuality(
          result.stages.enhancement?.canvas ||
            result.stages.crop.canvas,
          scanMode,
          result
        );
      }

      // Stage 5: Compression
      result.stages.compression = await this.processCompression(
        result.stages.enhancement?.canvas ||
          result.stages.crop.canvas,
        compressionProfile,
        result
      );

      result.success = true;
      result.metadata.duration = Date.now() - result.metadata.startTime;

      this.logger.info("Document processing completed", {
        duration: result.metadata.duration,
        success: true,
      });

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push({
        stage: "unknown",
        message: error.message,
      });

      this.logger.error("Document processing failed", {
        error: error.message,
        stage: error.stage,
      });

      return result;
    }
  }

  /**
   * Process orientation detection and rotation
   */
  async processOrientation(canvas, result) {
    try {
      const orientationResult =
        this.orientationDetector.detectOrientation(canvas);

      const stage = {
        detected: orientationResult.detectedOrientation,
        confidence: orientationResult.confidence,
        applied: false,
        rotatedCanvas: canvas,
        error: null,
      };

      if (
        orientationResult.requiresRotation &&
        orientationResult.confidence >=
          this.config.orientation.rotationThreshold &&
        this.config.orientation.autoRotateEnabled
      ) {
        stage.rotatedCanvas =
          await this.orientationDetector.rotateCanvas(
            canvas,
            orientationResult.rotationAngle
          );
        stage.applied = true;

        this.logger.info("Document rotated", {
          angle: orientationResult.rotationAngle,
          confidence: orientationResult.confidence,
        });
      }

      return stage;
    } catch (error) {
      result.warnings.push({
        stage: "orientation",
        message: error.message,
      });

      this.logger.warn("Orientation processing failed", {
        error: error.message,
      });

      return {
        detected: "unknown",
        confidence: 0,
        applied: false,
        rotatedCanvas: canvas,
        error: error.message,
      };
    }
  }

  /**
   * Process perspective correction and cropping
   */
  async processCrop(canvas, corners, result) {
    try {
      if (!corners || corners.length !== 4) {
        throw new Error("Invalid corners specification");
      }

      // Calculate output dimensions
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const w = Math.max(
        distance(corners[0], corners[1]),
        distance(corners[3], corners[2])
      );
      const h = Math.max(
        distance(corners[0], corners[3]),
        distance(corners[1], corners[2])
      );

      // Perform perspective transform
      const mat = cv.imread(canvas);
      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners[0].x,
        corners[0].y,
        corners[1].x,
        corners[1].y,
        corners[3].x,
        corners[3].y,
        corners[2].x,
        corners[2].y,
      ]);
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        w - 1,
        0,
        0,
        h - 1,
        w - 1,
        h - 1,
      ]);
      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const out = new cv.Mat();

      cv.warpPerspective(
        mat,
        out,
        M,
        new cv.Size(w, h),
        cv.INTER_CUBIC,
        cv.BORDER_CONSTANT,
        new cv.Scalar(255, 255, 255, 255)
      );

      // Display result
      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = w;
      croppedCanvas.height = h;
      cv.imshow(croppedCanvas, out);

      // Cleanup OpenCV resources
      mat.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();

      return {
        mat: out,
        canvas: croppedCanvas,
        width: w,
        height: h,
        error: null,
      };
    } catch (error) {
      result.errors.push({
        stage: "crop",
        message: error.message,
      });

      throw error;
    }
  }

  /**
   * Process enhancement
   */
  async processEnhancement(mat, scanMode, result) {
    try {
      const modeConfig = this.config.scanModes[scanMode] || this.config.scanModes.document;
      const enhancementProfile = modeConfig.enhancementProfile || "balanced";

      const enhanced = this.enhancementEngine.enhanceDocument(mat, {
        mode: enhancementProfile,
        enableShadowRemoval: true,
        enableSharpening: true,
        enableNoiseReduction: true,
        enableContrastBoost: modeConfig.contrastBoost ? true : false,
        contrastBoost: modeConfig.contrastBoost || 1.2,
      });

      const enhancedCanvas = document.createElement("canvas");
      enhancedCanvas.width = enhanced.cols;
      enhancedCanvas.height = enhanced.rows;
      cv.imshow(enhancedCanvas, enhanced);

      return {
        mat: enhanced,
        canvas: enhancedCanvas,
        profile: enhancementProfile,
        error: null,
      };
    } catch (error) {
      result.warnings.push({
        stage: "enhancement",
        message: error.message,
      });

      this.logger.warn("Enhancement failed", {
        error: error.message,
      });

      return {
        mat: null,
        canvas: null,
        profile: null,
        error: error.message,
      };
    }
  }

  /**
   * Process quality validation
   */
  async processQuality(canvas, scanMode, result) {
    try {
      const modeConfig = this.config.scanModes[scanMode] || this.config.scanModes.document;
      const qualityResult = this.qualityValidator.validateImage(canvas);

      const stage = {
        isAcceptable: qualityResult.isAcceptable,
        scores: {
          blur: qualityResult.blurScore,
          focus: qualityResult.focusScore,
          noise: qualityResult.noiseScore,
          readability: qualityResult.readabilityScore,
        },
        meetsThreshold:
          qualityResult.readabilityScore >=
          (modeConfig.qualityThreshold || 0.6),
        reason: qualityResult.getDetailedReason(),
        error: null,
      };

      if (!stage.meetsThreshold) {
        result.warnings.push({
          stage: "quality",
          message: stage.reason,
        });

        this.logger.warn("Quality below threshold", {
          threshold: modeConfig.qualityThreshold,
          readability: qualityResult.readabilityScore,
        });
      }

      return stage;
    } catch (error) {
      result.warnings.push({
        stage: "quality",
        message: error.message,
      });

      return {
        isAcceptable: false,
        scores: { blur: 0, focus: 0, noise: 0, readability: 0 },
        meetsThreshold: false,
        reason: error.message,
        error: error.message,
      };
    }
  }

  /**
   * Process compression
   */
  async processCompression(canvas, profileName, result) {
    try {
      const profile = this.compressionProfiles.getProfile(profileName);
      const estimatedSize = this.compressionProfiles.estimateFileSize(
        canvas.width,
        canvas.height,
        profileName
      );

      const blob = await this.compressionProfiles.canvasToBlob(
        canvas,
        profileName
      );

      const fileSizeComparison = this.compressionProfiles.compareFileSizes(
        canvas.width * canvas.height * 3,
        blob.size
      );

      return {
        profile: profileName,
        blob,
        actualSize: blob.size,
        estimatedSize,
        originalSize: canvas.width * canvas.height * 3,
        comparison: fileSizeComparison,
        error: null,
      };
    } catch (error) {
      result.errors.push({
        stage: "compression",
        message: error.message,
      });

      throw error;
    }
  }

  /**
   * Get OCR preprocessing
   * Optimizes image specifically for OCR accuracy
   */
  async preprocessForOCR(mat) {
    try {
      return this.enhancementEngine.ocrPreprocess(mat);
    } catch (error) {
      this.logger.error("OCR preprocessing failed", {
        error: error.message,
      });
      return mat.clone();
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(result) {
    if (result.stages.quality && !result.stages.quality.meetsThreshold) {
      return result.stages.quality.reason;
    }

    if (result.errors.length > 0) {
      return result.errors[0].message;
    }

    return "Document processing failed";
  }
}
