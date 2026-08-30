/**
 * Smart Enhancement Engine
 * Provides comprehensive image enhancement with multiple algorithms
 */

class EnhancementEngine {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
  }

  /**
   * Apply smart enhancement to a document image
   * @param {cv.Mat} sourceMat - OpenCV Mat of the image
   * @param {Object} options - Enhancement options
   * @returns {cv.Mat} - Enhanced image
   */
  enhanceDocument(sourceMat, options = {}) {
    const {
      mode = "balanced",
      enableShadowRemoval = true,
      enableSharpening = true,
      enableNoiseReduction = true,
      enableContrastBoost = false,
      contrastBoost = 1.2,
    } = options;

    let result = sourceMat.clone();

    try {
      // Apply noise reduction (often helps with subsequent processing)
      if (enableNoiseReduction) {
        result = this.denoise(result);
      }

      // Apply shadow removal
      if (enableShadowRemoval) {
        result = this.removeShadows(result);
      }

      // Sharpen text for better readability
      if (enableSharpening) {
        result = this.sharpen(result);
      }

      // Boost contrast for document clarity
      if (enableContrastBoost) {
        result = this.boostContrast(result, contrastBoost);
      }

      return result;
    } catch (e) {
      console.error("Enhancement error:", e);
      return sourceMat.clone();
    }
  }

  /**
   * Denoise using bilateral filtering
   * @param {cv.Mat} mat
   * @returns {cv.Mat}
   */
  denoise(mat) {
    const dst = new cv.Mat();
    cv.bilateralFilter(
      mat,
      dst,
      9, // diameter of each pixel neighborhood
      75, // sigma for color space
      75 // sigma for coordinate space
    );
    return dst;
  }

  /**
   * Remove shadows using morphological operations
   * @param {cv.Mat} mat
   * @returns {cv.Mat}
   */
  removeShadows(mat) {
    try {
      // Convert to HSV
      const hsv = new cv.Mat();
      cv.cvtColor(mat, hsv, cv.COLOR_BGR2HSV);

      // Split into channels
      const channels = new cv.MatVector();
      cv.split(hsv, channels);
      const hChannel = channels.get(0);
      const sChannel = channels.get(1);
      const vChannel = channels.get(2);

      // Enhance V (value/brightness) channel
      const vEnhanced = new cv.Mat();
      cv.equalizeHist(vChannel, vEnhanced);

      // Merge back
      const merged = new cv.MatVector();
      merged.push_back(hChannel);
      merged.push_back(sChannel);
      merged.push_back(vEnhanced);

      const result = new cv.Mat();
      cv.merge(merged, result);

      const bgr = new cv.Mat();
      cv.cvtColor(result, bgr, cv.COLOR_HSV2BGR);

      // Cleanup
      hsv.delete();
      channels.delete();
      hChannel.delete();
      sChannel.delete();
      vChannel.delete();
      vEnhanced.delete();
      merged.delete();
      result.delete();

      return bgr;
    } catch (e) {
      console.warn("Shadow removal failed:", e);
      return mat.clone();
    }
  }

  /**
   * Sharpen using unsharp masking
   * @param {cv.Mat} mat
   * @returns {cv.Mat}
   */
  sharpen(mat) {
    try {
      const blurred = new cv.Mat();
      const sharpened = new cv.Mat();

      // Create blurred version
      cv.GaussianBlur(mat, blurred, new cv.Size(3, 3), 0);

      // Unsharp mask: original + (original - blur)
      cv.addWeighted(
        mat,
        this.config.enhancement.unsharpMaskingStrength,
        blurred,
        -this.config.enhancement.unsharpMaskingBlur,
        0,
        sharpened
      );

      blurred.delete();
      return sharpened;
    } catch (e) {
      console.warn("Sharpening failed:", e);
      return mat.clone();
    }
  }

  /**
   * Boost contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)
   * @param {cv.Mat} mat
   * @param {number} clipLimit
   * @returns {cv.Mat}
   */
  boostContrast(mat, clipLimit = 2.0) {
    try {
      const gray = new cv.Mat();
      const result = new cv.Mat();

      // Convert to grayscale for CLAHE
      cv.cvtColor(mat, gray, cv.COLOR_BGR2GRAY);

      // Apply CLAHE
      const clahe = cv.createCLAHE(clipLimit, new cv.Size(8, 8));
      clahe.apply(gray, result);

      // Optionally merge back to color if needed
      gray.delete();
      clahe.delete();

      return result;
    } catch (e) {
      console.warn("Contrast boost failed:", e);
      return mat.clone();
    }
  }

  /**
   * Apply manual brightness adjustment
   * @param {cv.Mat} mat
   * @param {number} delta - -100 to 100
   * @returns {cv.Mat}
   */
  adjustBrightness(mat, delta = 0) {
    if (delta === 0) return mat.clone();

    const result = new cv.Mat();
    const scalar = new cv.Scalar(delta, delta, delta, 0);

    cv.addWeighted(mat, 1.0, new cv.Mat(), 0, delta, result);

    return result;
  }

  /**
   * Apply manual contrast adjustment
   * @param {cv.Mat} mat
   * @param {number} factor - 0.5 to 3.0
   * @returns {cv.Mat}
   */
  adjustContrast(mat, factor = 1.0) {
    if (factor === 1.0) return mat.clone();

    const result = new cv.Mat();
    cv.addWeighted(mat, factor, new cv.Mat(), 0, 0, result);

    return result;
  }

  /**
   * Apply text enhancement specific to OCR
   * @param {cv.Mat} mat
   * @returns {cv.Mat}
   */
  ocrPreprocess(mat) {
    try {
      let result = mat.clone();

      // Convert to grayscale
      const gray = new cv.Mat();
      if (result.channels && result.channels() > 1) {
        cv.cvtColor(result, gray, cv.COLOR_BGR2GRAY);
      } else {
        result.copyTo(gray);
      }

      // Denoise
      const denoised = new cv.Mat();
      cv.bilateralFilter(gray, denoised, 5, 50, 50);

      // Enhance contrast for text
      const enhanced = new cv.Mat();
      cv.equalizeHist(denoised, enhanced);

      // Optional: Threshold for binary text (helps OCR)
      // const binary = new cv.Mat();
      // cv.threshold(enhanced, binary, 127, 255, cv.THRESH_BINARY);

      denoised.delete();

      return enhanced;
    } catch (e) {
      console.warn("OCR preprocessing failed:", e);
      return mat.clone();
    }
  }

  /**
   * Resize mat to max dimensions while preserving aspect ratio
   * @param {cv.Mat} mat
   * @param {number} maxWidth
   * @param {number} maxHeight
   * @returns {cv.Mat}
   */
  resizeToMax(mat, maxWidth, maxHeight) {
    const resizeScale = Math.min(
      1,
      maxWidth / mat.cols,
      maxHeight / mat.rows
    );

    if (resizeScale >= 0.99) {
      // Nearly the same size, don't resize
      return mat.clone();
    }

    const newWidth = Math.max(1, Math.round(mat.cols * resizeScale));
    const newHeight = Math.max(1, Math.round(mat.rows * resizeScale));

    const result = new cv.Mat();
    cv.resize(mat, result, new cv.Size(newWidth, newHeight), 0, 0, cv.INTER_AREA);

    return result;
  }

  /**
   * Get enhancement profile settings
   * @param {string} profileName
   * @returns {Object}
   */
  getEnhancementProfile(profileName = "balanced") {
    const profiles = {
      light: {
        enableShadowRemoval: false,
        enableSharpening: true,
        enableNoiseReduction: false,
        enableContrastBoost: false,
      },
      balanced: {
        enableShadowRemoval: true,
        enableSharpening: true,
        enableNoiseReduction: true,
        enableContrastBoost: false,
      },
      aggressive: {
        enableShadowRemoval: true,
        enableSharpening: true,
        enableNoiseReduction: true,
        enableContrastBoost: true,
        contrastBoost: 1.5,
      },
      document: {
        enableShadowRemoval: true,
        enableSharpening: true,
        enableNoiseReduction: true,
        enableContrastBoost: true,
        contrastBoost: 1.3,
      },
      whiteboard: {
        enableShadowRemoval: true,
        enableSharpening: true,
        enableNoiseReduction: false,
        enableContrastBoost: true,
        contrastBoost: 1.5,
      },
    };

    return profiles[profileName] || profiles.balanced;
  }
}
