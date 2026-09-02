/**
 * Quality Validation Service
 * Evaluates image quality: blur, focus, noise, readability
 */

class QualityValidator {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
  }

  /**
   * Validate image quality on a canvas
   * @param {HTMLCanvasElement} canvas - Canvas containing the image
   * @returns {QualityResult} - Detailed quality scores and recommendation
   */
  validateImage(canvas) {
    try {
      if (!canvas || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) ||
          canvas.width < 2 || canvas.height < 2) {
        throw new Error("Image is not ready for quality analysis");
      }

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // detectBlur returns a normalized sharpness score (0 = blurred, 1 = sharp).
      // Keep blurScore for backwards compatibility with existing callers/UI.
      const blurScore = this.detectBlur(canvas, imageData);
      const focusScore = blurScore;
      const noiseScore = this.detectNoise(imageData);
      const readabilityScore = this.estimateReadability(
        canvas,
        blurScore,
        noiseScore
      );

      const isAcceptable =
        focusScore >= 0.5 && readabilityScore >= this.config.quality.readabilityThreshold;

      return new QualityResult(
        isAcceptable,
        this.toScore(blurScore),
        focusScore,
        noiseScore,
        readabilityScore,
        isAcceptable ? "Image quality acceptable" : "Image quality is below threshold"
      );
    } catch (e) {
      console.error("Quality validation error:", e);
      return new QualityResult(
        false,
        0,
        0,
        0,
        0,
        "Could not validate image quality"
      );
    }
  }

  /**
   * Detect motion blur using Laplacian variance
   * @param {HTMLCanvasElement} canvas
   * @param {ImageData} imageData
   * @returns {number} - Blur score (higher = more blurry)
   */
  detectBlur(canvas, imageData) {
    try {
      // Create a temporary mat for blur detection
      if (!window.cv) return 0.65;

      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const laplacian = new cv.Mat();
      const mean = new cv.Mat();
      const standardDeviation = new cv.Mat();

      try {
        // Convert to grayscale if needed
        if (src.channels && src.channels() === 4) {
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        } else {
          src.copyTo(gray);
        }

        // Apply Laplacian edge detection
        cv.Laplacian(gray, laplacian, cv.CV_64F);

        // Calculate variance of Laplacian
        // mean and standard deviation must be separate output matrices. Reusing
        // one matrix here causes OpenCV to produce invalid values on some builds.
        cv.meanStdDev(laplacian, mean, standardDeviation);
        const deviation = standardDeviation.data64F[0];
        const laplacianVariance = deviation * deviation;

        if (!Number.isFinite(laplacianVariance)) return 0.65;

        // Laplacian variance rises with edge detail. A score at/above the
        // configured threshold is sharp enough for a document scan.
        return this.toScore(laplacianVariance / this.config.quality.blurThreshold);
      } finally {
        src.delete();
        gray.delete();
        laplacian.delete();
        mean.delete();
        standardDeviation.delete();
      }
    } catch (e) {
      console.warn("Blur detection failed:", e);
      // Do not incorrectly label an otherwise valid image as poor merely
      // because an optional OpenCV metric could not be read.
      return 0.65;
    }
  }

  /**
   * Detect noise in the image
   * @param {ImageData} imageData
   * @returns {number} - Noise score (0-1, higher = more noise)
   */
  detectNoise(imageData) {
    const data = imageData.data;
    let noiseSum = 0;
    let sampleCount = 0;

    // Sample every 10th pixel to reduce computation
    for (let i = 0; i < data.length; i += 40) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // High-frequency components indicate noise
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      noiseSum += Math.abs(gray - 128); // Deviation from middle gray
      sampleCount++;
    }

    if (!sampleCount) return 0;
    const avgDeviation = noiseSum / sampleCount;
    return this.toScore(avgDeviation / 255); // 0-1 scale
  }

  /**
   * Estimate how readable text is in the image
   * @param {HTMLCanvasElement} canvas
   * @param {number} blurScore
   * @param {number} noiseScore
   * @returns {number} - Readability score (0-1)
   */
  estimateReadability(canvas, blurScore, noiseScore) {
    // Readability depends on multiple factors
    const sharpness = this.toScore(blurScore);
    const noiseFactor = 1 - this.toScore(noiseScore * 0.5);

    // Check for reasonable brightness/contrast
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let minBrightness = 255;
      let maxBrightness = 0;
      let totalBrightness = 0;
      let sampleCount = 0;

      for (let i = 0; i < data.length; i += 40) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        minBrightness = Math.min(minBrightness, gray);
        maxBrightness = Math.max(maxBrightness, gray);
        totalBrightness += gray;
        sampleCount++;
      }

      if (!sampleCount) return sharpness * noiseFactor;
      const avgBrightness = totalBrightness / sampleCount;
      const contrast = maxBrightness - minBrightness;

      // Penalize images that are too dark, too bright, or have low contrast
      const brightnessFactor =
        avgBrightness >= this.config.quality.minBrightness &&
        avgBrightness <= this.config.quality.maxBrightness
          ? 1.0
          : 0.6;

      const contrastFactor = contrast >= this.config.quality.minContrast ? 1.0 : 0.7;

      return this.toScore((sharpness * 0.5 + noiseFactor * 0.25 + brightnessFactor * 0.15 + contrastFactor * 0.1) *
        0.95); // Slightly reduced max to account for unknown factors
    } catch (e) {
      return this.toScore(sharpness * noiseFactor);
    }
  }

  /** Keep all externally displayed scores finite and inside the 0–1 range. */
  toScore(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }

  /**
   * Check if image is too dark
   */
  isToDark(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let totalBrightness = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += 40) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalBrightness += gray;
      sampleCount++;
    }

    return (totalBrightness / sampleCount) < this.config.quality.minBrightness;
  }

  /**
   * Check if image is too bright (washed out)
   */
  isTooBright(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let totalBrightness = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += 40) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalBrightness += gray;
      sampleCount++;
    }

    return (totalBrightness / sampleCount) > this.config.quality.maxBrightness;
  }
}
