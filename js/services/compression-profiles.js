/**
 * Compression Profiles Service
 * Manages different compression and file size strategies
 */

class CompressionProfiles {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.profiles = config.compressionProfiles;
  }

  /**
   * Get profile by name
   * @param {string} profileName
   * @returns {Object}
   */
  getProfile(profileName) {
    return this.profiles[profileName] || this.profiles.balanced;
  }

  /**
   * Get all available profiles
   * @returns {Array<Object>}
   */
  getAllProfiles() {
    return Object.entries(this.profiles).map(([key, value]) => ({
      id: key,
      ...value,
    }));
  }

  /**
   * Estimate file size for given image dimensions and profile
   * @param {number} width
   * @param {number} height
   * @param {string} profileName
   * @returns {number} Estimated size in bytes
   */
  estimateFileSize(width, height, profileName) {
    const profile = this.getProfile(profileName);
    const pixels = width * height;

    // Rough estimation: JPEG compression typically reduces size to:
    // 20-30% at 0.6 quality
    // 30-50% at 0.78 quality
    // 50-70% at 0.92 quality

    const baseBytes = pixels * 3; // 3 bytes per pixel RGB

    let compressionFactor;
    if (profile.jpegQuality >= 0.9) {
      compressionFactor = 0.65; // 35% compression
    } else if (profile.jpegQuality >= 0.75) {
      compressionFactor = 0.40; // 60% compression
    } else {
      compressionFactor = 0.25; // 75% compression
    }

    return Math.round(baseBytes * compressionFactor);
  }

  /**
   * Format bytes to human readable
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Get compression recommendation based on image dimensions
   * @param {number} width
   * @param {number} height
   * @returns {string} Profile name
   */
  recommendProfile(width, height) {
    const megapixels = (width * height) / 1000000;

    if (megapixels > 8) {
      // Large images: recommend smaller size
      return "smallSize";
    } else if (megapixels > 4) {
      // Medium images: recommend balanced
      return "balanced";
    } else {
      // Small images: can use high quality
      return "highQuality";
    }
  }

  /**
   * Convert canvas to blob with specified profile
   * @param {HTMLCanvasElement} canvas
   * @param {string} profileName
   * @returns {Promise<Blob>}
   */
  async canvasToBlob(canvas, profileName) {
    const profile = this.getProfile(profileName);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Could not encode image"));
          }
        },
        "image/jpeg",
        profile.jpegQuality
      );
    });
  }

  /**
   * Resize image to compression profile resolution
   * @param {cv.Mat} mat
   * @param {string} profileName
   * @returns {cv.Mat}
   */
  resizeForProfile(mat, profileName) {
    const profile = this.getProfile(profileName);
    const maxSize = profile.resizeThreshold;

    const resizeScale = Math.min(
      1,
      maxSize / Math.max(mat.cols, mat.rows)
    );

    if (resizeScale >= 0.99) {
      return mat.clone();
    }

    const newWidth = Math.max(1, Math.round(mat.cols * resizeScale));
    const newHeight = Math.max(1, Math.round(mat.rows * resizeScale));

    const result = new cv.Mat();
    cv.resize(mat, result, new cv.Size(newWidth, newHeight), 0, 0, cv.INTER_AREA);

    return result;
  }

  /**
   * Compare file sizes and savings
   * @param {number} originalSize
   * @param {number} compressedSize
   * @returns {Object}
   */
  compareFileSizes(originalSize, compressedSize) {
    const saved = Math.max(0, originalSize - compressedSize);
    const savedPercent =
      originalSize > 0 ? Math.round((saved / originalSize) * 100) : 0;

    return {
      original: this.formatBytes(originalSize),
      compressed: this.formatBytes(compressedSize),
      saved: this.formatBytes(saved),
      savedPercent: savedPercent,
    };
  }

  /**
   * Get file size comparison text
   * @param {number} originalSize
   * @param {number} compressedSize
   * @returns {string}
   */
  getFileSizeText(originalSize, compressedSize) {
    const comparison = this.compareFileSizes(originalSize, compressedSize);
    return `${comparison.saved} smaller (${comparison.savedPercent}% reduction)`;
  }
}
