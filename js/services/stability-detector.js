/**
 * Stability Detection Service
 * Tracks document/camera stability over multiple frames for auto-capture
 */

class StabilityDetector {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.frameHistory = [];
    this.maxFrames = config.stability.requiredFrames || 5;
    this.maxDeviation = config.stability.maxDeviation || 15;
  }

  /**
   * Add a new detection frame to the history
   * @param {Array} corners - [{x,y}, {x,y}, {x,y}, {x,y}] detected corners
   * @param {number} confidence - 0-1 detection confidence
   * @returns {Object} - {isStable, score, framesRecorded}
   */
  recordFrame(corners, confidence) {
    if (!corners || corners.length !== 4) {
      this.reset();
      return { isStable: false, score: 0, framesRecorded: 0 };
    }

    this.frameHistory.push({
      corners,
      confidence,
      timestamp: Date.now(),
    });

    // Keep only the most recent frames
    if (this.frameHistory.length > this.maxFrames) {
      this.frameHistory.shift();
    }

    return this.calculateStability();
  }

  /**
   * Calculate stability score based on frame history
   * @returns {Object} - {isStable, score, framesRecorded, details}
   */
  calculateStability() {
    const framesRecorded = this.frameHistory.length;

    if (framesRecorded < 2) {
      return {
        isStable: false,
        score: 0,
        framesRecorded,
        details: "Not enough frames recorded",
      };
    }

    // Calculate corner movement deviation across frames
    const deviations = [];
    for (let i = 1; i < framesRecorded; i++) {
      const prevCorners = this.frameHistory[i - 1].corners;
      const currCorners = this.frameHistory[i].corners;
      const deviation = this.calculateCornerDeviation(prevCorners, currCorners);
      deviations.push(deviation);
    }

    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const maxFrameDeviation = Math.max(...deviations);

    // Calculate confidence consistency
    const confidences = this.frameHistory.map((f) => f.confidence);
    const avgConfidence =
      confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const confidenceVariance =
      confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) /
      confidences.length;
    const confidenceStability = 1 - Math.min(1, confidenceVariance);

    // Calculate overall stability score
    const deviationScore = Math.max(0, 1 - avgDeviation / this.maxDeviation);
    const frameCountScore = Math.min(1, framesRecorded / this.maxFrames);
    const overallScore =
      (deviationScore * 0.5 + confidenceStability * 0.3 + frameCountScore * 0.2) *
      avgConfidence;

    const isStable =
      framesRecorded >= this.maxFrames &&
      avgDeviation <= this.maxDeviation &&
      avgConfidence >= 0.6;

    return {
      isStable,
      score: Math.min(1, overallScore),
      framesRecorded,
      details: {
        avgDeviation: avgDeviation.toFixed(2),
        maxDeviation: maxFrameDeviation.toFixed(2),
        avgConfidence: avgConfidence.toFixed(2),
        confidenceStability: confidenceStability.toFixed(2),
      },
    };
  }

  /**
   * Calculate total deviation of corners between two frames
   * @private
   */
  calculateCornerDeviation(prevCorners, currCorners) {
    let totalDistance = 0;
    for (let i = 0; i < 4; i++) {
      const dx = currCorners[i].x - prevCorners[i].x;
      const dy = currCorners[i].y - prevCorners[i].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    return totalDistance / 4; // Average deviation per corner
  }

  /**
   * Reset frame history
   */
  reset() {
    this.frameHistory = [];
  }

  /**
   * Get current frame history (for debugging)
   */
  getHistory() {
    return this.frameHistory;
  }
}
