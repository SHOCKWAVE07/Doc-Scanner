/**
 * Magnifier UI Component
 * Displays magnified view when adjusting crop corners
 */

class MagnifierUI {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.magnifierElement = null;
    this.magnifierCanvas = null;
    this.isVisible = false;
    this.zoomLevel = 3; // 3x magnification
    this.magnifierSize = 110; // pixels
    this.crosshairElement = null;
  }

  /**
   * Initialize magnifier
   * @param {HTMLElement} magnifierElement - The magnifier container
   */
  initialize(magnifierElement) {
    this.magnifierElement = magnifierElement;
    this.magnifierCanvas = magnifierElement?.querySelector("canvas");
    this.crosshairElement = magnifierElement?.querySelector(".magnifier-crosshair");

    if (this.magnifierCanvas) {
      this.magnifierCanvas.width = this.magnifierSize;
      this.magnifierCanvas.height = this.magnifierSize;
    }
  }

  /**
   * Show magnifier at position
   */
  show(x, y) {
    if (!this.magnifierElement) return;

    this.magnifierElement.classList.add("visible");
    this.isVisible = true;
    this.updatePosition(x, y);
  }

  /**
   * Hide magnifier
   */
  hide() {
    if (!this.magnifierElement) return;

    this.magnifierElement.classList.remove("visible");
    this.isVisible = false;
  }

  /**
   * Update magnifier display
   * @param {HTMLCanvasElement} sourceCanvas - Source canvas to magnify
   * @param {number} clientX - Cursor X position
   * @param {number} clientY - Cursor Y position
   * @param {Object} corner - Corner point being adjusted {x, y}
   */
  update(sourceCanvas, clientX, clientY, corner) {
    if (!this.isVisible || !this.magnifierCanvas || !sourceCanvas) return;

    // Update position
    this.updatePosition(clientX, clientY);

    // Render magnified region
    this.renderMagnifiedRegion(sourceCanvas, corner);

    // Draw corner indicator
    this.drawCornerIndicator();
  }

  /**
   * Update magnifier position
   * @private
   */
  updatePosition(clientX, clientY) {
    if (!this.magnifierElement) return;

    const offsetX = this.magnifierSize / 2;
    const offsetY = this.magnifierSize / 2;

    this.magnifierElement.style.left = clientX - offsetX + "px";
    this.magnifierElement.style.top = clientY - offsetY + "px";
  }

  /**
   * Render magnified region of canvas
   * @private
   */
  renderMagnifiedRegion(sourceCanvas, corner) {
    if (!this.magnifierCanvas) return;

    const ctx = this.magnifierCanvas.getContext("2d");
    if (!ctx) return;

    const sourceSize = this.magnifierSize / this.zoomLevel;
    const centerX = Math.max(0, Math.min(sourceCanvas.width, corner.x));
    const centerY = Math.max(0, Math.min(sourceCanvas.height, corner.y));
    const sourceX = Math.max(0, Math.min(sourceCanvas.width - sourceSize, centerX - sourceSize / 2));
    const sourceY = Math.max(0, Math.min(sourceCanvas.height - sourceSize, centerY - sourceSize / 2));

    // Clear canvas
    ctx.clearRect(0, 0, this.magnifierSize, this.magnifierSize);

    // Draw magnified region
    ctx.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      this.magnifierCanvas.width,
      this.magnifierCanvas.height
    );

    // Draw grid for alignment
    this.drawAlignmentGrid(ctx);
  }

  /**
   * Draw grid lines for alignment reference
   * @private
   */
  drawAlignmentGrid(ctx) {
    const gridSize = 30;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = gridSize; x < this.magnifierSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.magnifierSize);
      ctx.stroke();
    }

    // Horizontal lines
    for (let y = gridSize; y < this.magnifierSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.magnifierSize, y);
      ctx.stroke();
    }
  }

  /**
   * Draw corner indicator in center
   * @private
   */
  drawCornerIndicator() {
    if (!this.magnifierCanvas) return;

    const ctx = this.magnifierCanvas.getContext("2d");
    if (!ctx) return;

    const centerX = this.magnifierSize / 2;
    const centerY = this.magnifierSize / 2;
    const indicatorSize = 12;

    // Draw corner indicator circles/squares
    ctx.strokeStyle = "rgba(255, 100, 100, 0.8)";
    ctx.lineWidth = 2;

    // Outer circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, indicatorSize, 0, Math.PI * 2);
    ctx.stroke();

    // Small cross
    ctx.beginPath();
    ctx.moveTo(centerX - 5, centerY);
    ctx.lineTo(centerX + 5, centerY);
    ctx.moveTo(centerX, centerY - 5);
    ctx.lineTo(centerX, centerY + 5);
    ctx.stroke();
  }

  /**
   * Enable pinch-to-zoom support (for touch devices)
   * @param {Function} onZoomChange - Callback when zoom level changes
   */
  enablePinchZoom(onZoomChange) {
    if (!this.magnifierElement) return;

    let initialDistance = 0;
    let initialZoom = this.zoomLevel;

    this.magnifierElement.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        const p1 = e.touches[0];
        const p2 = e.touches[1];
        initialDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
        initialZoom = this.zoomLevel;
      }
    });

    this.magnifierElement.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        const p1 = e.touches[0];
        const p2 = e.touches[1];
        const currentDistance = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
        const ratio = currentDistance / initialDistance;

        // Adjust zoom between 1x and 5x
        this.zoomLevel = Math.max(1, Math.min(5, initialZoom * ratio));

        if (onZoomChange) {
          onZoomChange(this.zoomLevel);
        }

        e.preventDefault();
      }
    });
  }

  /**
   * Set zoom level
   */
  setZoom(level) {
    this.zoomLevel = Math.max(1, Math.min(5, level));
  }

  /**
   * Get zoom level
   */
  getZoom() {
    return this.zoomLevel;
  }

  /**
   * Check if magnifier is visible
   */
  isVisibleNow() {
    return this.isVisible;
  }
}
