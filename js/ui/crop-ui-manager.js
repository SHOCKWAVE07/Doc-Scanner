/**
 * Crop UI Manager
 * Handles 8-point crop interface with corner and midpoint controls
 */

class CropUIManager {
  constructor(config = SCANNER_CONFIG) {
    this.config = config;
    this.canvas = null;
    this.svg = null;
    this.quadElement = null;
    this.cornerElements = [];
    this.midpointElements = [];
    this.magnifier = null;
    this.isDragging = false;
    this.draggedPoint = null;
    this.draggedPointType = null; // 'corner' or 'midpoint'
    this.draggedPointIndex = null;
    this.corners = [];
    this.onCropChange = null;
    this.eventsAttached = false;
    this.minCropArea = 0.05; // Minimum 5% of canvas area
  }

  /**
   * Initialize crop UI
   * @param {HTMLCanvasElement} canvas - Source canvas
   * @param {SVGElement} svg - SVG overlay
   * @param {HTMLElement} quadElement - Quad polygon element
   * @param {Array} initialCorners - Initial corner positions [{x,y}, {x,y}, {x,y}, {x,y}]
   * @param {HTMLElement} magnifierElement - Magnifier UI element
   */
  initialize(canvas, svg, quadElement, initialCorners, magnifierElement) {
    this.canvas = canvas;
    this.svg = svg;
    this.quadElement = quadElement;
    this.magnifier = magnifierElement;

    this.corners = initialCorners || this.getDefaultCorners();
    this.setupCornerHandles();
    this.setupMidpointHandles();
    this.attachEventListeners();
    this.render();
  }

  /**
   * Get default corners (full canvas)
   * @private
   */
  getDefaultCorners() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return [
      { x: 0, y: 0 }, // TL
      { x: w, y: 0 }, // TR
      { x: w, y: h }, // BR
      { x: 0, y: h }, // BL
    ];
  }

  /**
   * Setup corner handle elements
   * @private
   */
  setupCornerHandles() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`c${i}`);
      if (el) {
        this.cornerElements[i] = el;
        el.dataset.index = i;
      }
    }
  }

  /**
   * Setup midpoint handle elements
   * @private
   */
  setupMidpointHandles() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`m${i}`);
      if (el) {
        this.midpointElements[i] = el;
        el.dataset.index = i;
      }
    }
  }

  /**
   * Attach event listeners to handle elements
   * @private
   */
  attachEventListeners() {
    if (this.eventsAttached) return;
    this.eventsAttached = true;

    // Corner dragging
    this.cornerElements.forEach((el, index) => {
      if (el) {
        el.addEventListener("pointerdown", (e) =>
          this.onPointerDown(e, "corner", index)
        );
      }
    });

    // Midpoint dragging
    this.midpointElements.forEach((el, index) => {
      if (el) {
        el.addEventListener("pointerdown", (e) =>
          this.onPointerDown(e, "midpoint", index)
        );
      }
    });

    // Global pointer events
    document.addEventListener("pointermove", (e) => this.onPointerMove(e));
    document.addEventListener("pointerup", (e) => this.onPointerUp(e));
  }

  /**
   * Handle pointer down on handle
   * @private
   */
  onPointerDown(e, type, index) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    this.isDragging = true;
    this.draggedPointType = type;
    this.draggedPointIndex = index;
    this.draggedPoint = {
      x: e.clientX,
      y: e.clientY,
    };

    if (e.currentTarget?.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    // All eight handles need the same precision feedback.
    if (this.magnifier) {
      this.showMagnifier(e.clientX, e.clientY, index);
    }

    e.preventDefault();
  }

  /**
   * Handle pointer move while dragging
   * @private
   */
  onPointerMove(e) {
    if (!this.isDragging || !this.draggedPoint) return;

    const delta = {
      x: e.clientX - this.draggedPoint.x,
      y: e.clientY - this.draggedPoint.y,
    };

    if (this.draggedPointType === "corner") {
      this.moveCorner(this.draggedPointIndex, delta);
    } else if (this.draggedPointType === "midpoint") {
      this.moveMidpoint(this.draggedPointIndex, delta);
    }

    this.draggedPoint = { x: e.clientX, y: e.clientY };

    // Update magnifier if visible
    if (this.magnifier && this.magnifier.classList.contains("visible")) {
      this.updateMagnifier(e.clientX, e.clientY);
    }

    this.render();
  }

  /**
   * Handle pointer up (stop dragging)
   * @private
   */
  onPointerUp(e) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.draggedPoint = null;
    this.draggedPointType = null;
    this.draggedPointIndex = null;

    // Hide magnifier
    if (this.magnifier) {
      this.magnifier.classList.remove("visible");
    }

    // Validate and normalize corners
    if (this.validateCorners()) {
      this.render();
      if (this.onCropChange) {
        this.onCropChange(this.corners);
      }
    }
  }

  /**
   * Move a corner point
   * @private
   */
  moveCorner(index, delta) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / canvasRect.width;
    const scaleY = this.canvas.height / canvasRect.height;

    this.corners[index].x += delta.x * scaleX;
    this.corners[index].y += delta.y * scaleY;

    // Clamp to canvas bounds
    this.corners[index].x = Math.max(0, Math.min(this.canvas.width, this.corners[index].x));
    this.corners[index].y = Math.max(0, Math.min(this.canvas.height, this.corners[index].y));
  }

  /**
   * Move a midpoint - affects adjacent corners
   * @private
   */
  moveMidpoint(index, delta) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / canvasRect.width;
    const scaleY = this.canvas.height / canvasRect.height;

    // Map midpoint index to affected corners
    const adjacentCorners = [
      [0, 1], // Top midpoint affects TL and TR
      [1, 2], // Right midpoint affects TR and BR
      [2, 3], // Bottom midpoint affects BR and BL
      [3, 0], // Left midpoint affects BL and TL
    ];

    const [c1, c2] = adjacentCorners[index];

    if (index === 0) {
      // Top midpoint - move TL and TR Y
      this.corners[c1].y += delta.y * scaleY;
      this.corners[c2].y += delta.y * scaleY;
    } else if (index === 1) {
      // Right midpoint - move TR and BR X
      this.corners[c1].x += delta.x * scaleX;
      this.corners[c2].x += delta.x * scaleX;
    } else if (index === 2) {
      // Bottom midpoint - move BR and BL Y
      this.corners[c1].y += delta.y * scaleY;
      this.corners[c2].y += delta.y * scaleY;
    } else if (index === 3) {
      // Left midpoint - move BL and TL X
      this.corners[c1].x += delta.x * scaleX;
      this.corners[c2].x += delta.x * scaleX;
    }

    // Clamp to bounds
    this.corners.forEach((corner) => {
      corner.x = Math.max(0, Math.min(this.canvas.width, corner.x));
      corner.y = Math.max(0, Math.min(this.canvas.height, corner.y));
    });
  }

  /**
   * Validate corners form a valid quadrilateral
   * @private
   */
  validateCorners() {
    if (this.corners.length !== 4) return false;

    // Calculate area
    const area = this.calculateQuadArea(this.corners);
    const canvasArea = this.canvas.width * this.canvas.height;

    if (area < canvasArea * this.minCropArea) {
      console.warn("Crop area too small, rejecting");
      return false;
    }

    // Check for crossing edges (invalid polygon)
    if (this.hasIntersectingEdges(this.corners)) {
      console.warn("Invalid polygon (intersecting edges), rejecting");
      return false;
    }

    return true;
  }

  /**
   * Calculate quadrilateral area using shoelace formula
   * @private
   */
  calculateQuadArea(corners) {
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      area += corners[i].x * corners[next].y - corners[next].x * corners[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Check if edges of polygon intersect (invalid geometry)
   * @private
   */
  hasIntersectingEdges(corners) {
    // Check if opposite edges intersect
    const edge1 = { p1: corners[0], p2: corners[2] }; // TL-BR diagonal
    const edge2 = { p1: corners[1], p2: corners[3] }; // TR-BL diagonal

    // For a simple quad, we just check if the corners are in proper order
    const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    return ccw(corners[0], corners[2], corners[1]) !== ccw(corners[0], corners[2], corners[3]);
  }

  /**
   * Render crop UI (corners, midpoints, quad polygon)
   * @private
   */
  render() {
    if (!this.quadElement || !this.svg) return;

    // Update quad polygon
    const points = this.corners.map((c) => `${c.x},${c.y}`).join(" ");
    this.quadElement.setAttribute("points", points);

    // Update corner handles
    this.cornerElements.forEach((el, i) => {
      if (el) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (this.corners[i].x / this.canvas.width) * rect.width;
        const y = (this.corners[i].y / this.canvas.height) * rect.height;

        el.style.left = x + "px";
        el.style.top = y + "px";
      }
    });

    // Update midpoint handles
    const midpoints = [
      { i: 0, j: 1 }, // Top
      { i: 1, j: 2 }, // Right
      { i: 2, j: 3 }, // Bottom
      { i: 3, j: 0 }, // Left
    ];

    midpoints.forEach((pair, idx) => {
      if (this.midpointElements[idx]) {
        const mid = {
          x: (this.corners[pair.i].x + this.corners[pair.j].x) / 2,
          y: (this.corners[pair.i].y + this.corners[pair.j].y) / 2,
        };

        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (mid.x / this.canvas.width) * rect.width;
        const y = (mid.y / this.canvas.height) * rect.height;

        const el = this.midpointElements[idx];
        el.style.left = x + "px";
        el.style.top = y + "px";
      }
    });
  }

  /**
   * Show magnifier overlay
   * @private
   */
  showMagnifier(clientX, clientY, cornerIndex) {
    if (!this.magnifier) return;

    this.magnifier.classList.add("visible");
    this.updateMagnifier(clientX, clientY);
  }

  /**
   * Update magnifier position and content
   * @private
   */
  updateMagnifier(clientX, clientY) {
    if (!this.magnifier) return;

    const magnifierCanvas = this.magnifier.querySelector("canvas");
    if (!magnifierCanvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const zoomLevel = 3; // 3x magnification
    const magnifierSize = 110; // pixels

    // Keep the bubble in the centre of the editor so it never sits under the
    // finger that is moving a crop handle. Its contents still follow the handle.
    this.magnifier.style.left = "50%";
    this.magnifier.style.top = "50%";

    // Calculate source region
    const canvasX = ((clientX - rect.left) / rect.width) * this.canvas.width;
    const canvasY = ((clientY - rect.top) / rect.height) * this.canvas.height;

    const sourceSize = magnifierSize / zoomLevel;
    const sourceX = Math.max(0, Math.min(this.canvas.width - sourceSize, canvasX - sourceSize / 2));
    const sourceY = Math.max(0, Math.min(this.canvas.height - sourceSize, canvasY - sourceSize / 2));

    // Draw magnified region
    const ctx = magnifierCanvas.getContext("2d");
    ctx.drawImage(
      this.canvas,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      magnifierCanvas.width,
      magnifierCanvas.height
    );
  }

  /**
   * Update corners (programmatically)
   */
  setCorners(newCorners) {
    if (newCorners && newCorners.length === 4) {
      this.corners = newCorners;
      this.render();
    }
  }

  /**
   * Get current corners
   */
  getCorners() {
    return [...this.corners];
  }

  /**
   * Register callback for crop changes
   */
  setOnCropChange(callback) {
    this.onCropChange = callback;
  }
}
