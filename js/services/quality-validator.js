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
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const blurScore = this.detectBlur(canvas, imageData);
      const focusScore = 1 - Math.min(1, blurScore / this.config.quality.blurThreshold);
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
        Math.max(0, Math.min(1, 1 - blurScore / 200)),
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
      if (!window.cv) return 0;

      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const laplacian = new cv.Mat();
      const dst = new cv.Mat();

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
        cv.meanStdDev(laplacian, dst, dst);
        const laplacianVariance = dst.data64F[1] * dst.data64F[1]; // std^2 = variance

        return Math.max(0, 200 - laplacianVariance); // Inverted: high variance = sharp
      } finally {
        src.delete();
        gray.delete();
        laplacian.delete();
        dst.delete();
      }
    } catch (e) {
      console.warn("Blur detection failed:", e);
      return 50; // Default middle value
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

    const avgDeviation = noiseSum / sampleCount;
    return Math.min(1, avgDeviation / 255); // 0-1 scale
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
    const sharpness = 1 - Math.min(1, blurScore / 150); // More blur = less readable
    const noiseFactor = 1 - Math.min(1, noiseScore * 0.5); // More noise = less readable

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

      const avgBrightness = totalBrightness / sampleCount;
      const contrast = maxBrightness - minBrightness;

      // Penalize images that are too dark, too bright, or have low contrast
      const brightnessFactor =
        avgBrightness >= this.config.quality.minBrightness &&
        avgBrightness <= this.config.quality.maxBrightness
          ? 1.0
          : 0.6;

      const contrastFactor = contrast >= this.config.quality.minContrast ? 1.0 : 0.7;

      return (sharpness * 0.5 + noiseFactor * 0.25 + brightnessFactor * 0.15 + contrastFactor * 0.1) *
        0.95; // Slightly reduced max to account for unknown factors
    } catch (e) {
      return sharpness * noiseFactor;
    }
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
