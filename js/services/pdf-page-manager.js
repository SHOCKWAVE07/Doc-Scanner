/**
 * PDF Page Manager Service
 * Manages mixed pages (scanned, gallery, imported PDF)
 * Handles page operations: edit, delete, rotate, reorder
 */

class PDFPageManager {
  constructor() {
    this.editingPageId = null;
  }

  /**
   * Mark a page as being edited
   * @param {string} pageId 
   */
  setEditingPage(pageId) {
    this.editingPageId = pageId;
  }

  /**
   * Get the page being edited
   * @returns {string|null}
   */
  getEditingPage() {
    return this.editingPageId;
  }

  /**
   * Clear editing page
   */
  clearEditingPage() {
    this.editingPageId = null;
  }

  /**
   * Add a new page to the pages array
   * @param {Object} pageData - Page object
   * @param {Array} pages - Pages array
   */
  addPage(pageData, pages) {
    if (!pageData.id) {
      pageData.id = `page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    // Ensure required fields
    pageData.rotation = pageData.rotation || 0;
    pageData.type = pageData.type || 'unknown';
    pageData.url = pageData.url || URL.createObjectURL(pageData.blob);

    pages.push(pageData);
    return pageData;
  }

  /**
   * Delete a page by index
   * @param {number} index - Page index
   * @param {Array} pages - Pages array
   */
  deletePage(index, pages) {
    if (index < 0 || index >= pages.length) return false;

    const page = pages[index];
    if (page.url) {
      URL.revokeObjectURL(page.url);
    }

    pages.splice(index, 1);
    return true;
  }

  /**
   * Rotate a page
   * @param {number} index - Page index
   * @param {number} degrees - Rotation degrees (90, 180, 270, -90)
   * @param {Array} pages - Pages array
   */
  rotatePage(index, degrees, pages) {
    if (index < 0 || index >= pages.length) return false;

    const page = pages[index];
    page.rotation = (page.rotation + degrees) % 360;
    if (page.rotation < 0) page.rotation += 360;

    return true;
  }

  /**
   * Get page rotation in degrees
   * @param {number} index - Page index
   * @param {Array} pages - Pages array
   * @returns {number}
   */
  getPageRotation(index, pages) {
    if (index < 0 || index >= pages.length) return 0;
    return pages[index].rotation || 0;
  }

  /**
   * Reorder pages
   * @param {Array} newOrder - Array of page indices in new order
   * @param {Array} pages - Pages array
   */
  reorderPages(newOrder, pages) {
    if (newOrder.length !== pages.length) return false;

    const reordered = newOrder.map(i => pages[i]);
    pages.splice(0, pages.length, ...reordered);
    return true;
  }

  /**
   * Update a page (for after editing)
   * @param {number} index - Page index
   * @param {Object} updates - Updates to apply
   * @param {Array} pages - Pages array
   */
  updatePage(index, updates, pages) {
    if (index < 0 || index >= pages.length) return false;

    const page = pages[index];
    Object.assign(page, updates);

    // Mark as edited if blob changed
    if (updates.blob) {
      page.edited = true;
    }

    return true;
  }

  /**
   * Get page by ID
   * @param {string} pageId 
   * @param {Array} pages 
   * @returns {Object|null}
   */
  getPageById(pageId, pages) {
    return pages.find(p => p.id === pageId) || null;
  }

  /**
   * Get page index by ID
   * @param {string} pageId 
   * @param {Array} pages 
   * @returns {number}
   */
  getPageIndexById(pageId, pages) {
    return pages.findIndex(p => p.id === pageId);
  }

  /**
   * Get source badge for display
   * @param {string} type - Page type
   * @returns {string}
   */
  getSourceBadge(type) {
    const badges = {
      'scanned': '📸',
      'gallery': '🖼️',
      'pdf-imported': '📄'
    };
    return badges[type] || '📄';
  }

  /**
   * Get source label
   * @param {string} type 
   * @returns {string}
   */
  getSourceLabel(type) {
    const labels = {
      'scanned': 'Scanned',
      'gallery': 'Gallery',
      'pdf-imported': 'PDF Import'
    };
    return labels[type] || 'Unknown';
  }

  /**
   * Can this page be edited (cropped)?
   * @param {string} type 
   * @returns {boolean}
   */
  canEditPage(type) {
    // Allow editing of all page types
    return true;
  }

  /**
   * Get stats about pages
   * @param {Array} pages 
   * @returns {Object}
   */
  getStats(pages) {
    const stats = {
      total: pages.length,
      scanned: 0,
      gallery: 0,
      pdfImported: 0,
      totalSize: 0
    };

    pages.forEach(p => {
      if (p.type === 'scanned') stats.scanned++;
      else if (p.type === 'gallery') stats.gallery++;
      else if (p.type === 'pdf-imported') stats.pdfImported++;

      if (p.blob) stats.totalSize += p.blob.size;
    });

    return stats;
  }
}

// Create singleton instance
const pdfPageManager = new PDFPageManager();
