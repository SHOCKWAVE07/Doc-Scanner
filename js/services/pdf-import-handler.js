/**
 * PDF Import Handler Service
 * Handles PDF file import and page extraction
 */

class PDFImportHandler {
  constructor() {
    this.pdfLib = null;
  }

  /**
   * Initialize PDF library (pdf.js)
   */
  async initialize() {
    if (this.pdfLib) return;

    // Check if pdfjs is available, otherwise load it
    if (!window.pdfjsLib) {
      // Load pdf.js from CDN
      if (!window.PDFWorkerLoaded) {
        window.pdfjsLib = await this._loadPdfJS();
        window.PDFWorkerLoaded = true;
      }
    }
    this.pdfLib = window.pdfjsLib;
  }

  /**
   * Load pdf.js library from CDN
   */
  _loadPdfJS() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        // Set worker for pdf.js
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('pdfjs-dist failed to load'));
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Import PDF file and extract pages
   * @param {File} file - PDF file to import
   * @param {Function} onProgress - Progress callback (current, total)
   * @returns {Promise<Array>} Array of page objects
   */
  async importPDF(file, onProgress) {
    if (!file || (!file.type.toLowerCase().includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
      throw new Error('File is not a PDF');
    }

    try {
      await this.initialize();

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Load PDF
      const pdf = await this.pdfLib.getDocument({ data: arrayBuffer }).promise;
      const pages = [];

      // Extract each page
      for (let i = 1; i <= pdf.numPages; i++) {
        if (onProgress) onProgress(i, pdf.numPages);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // 2x for better quality

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        const context = canvas.getContext('2d');
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Convert canvas to blob
        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', 0.92);
        });
        if (!blob) throw new Error('The browser could not create an image for PDF page ' + i);

        // Create page object
        const pageObj = {
          id: `pdf-${Date.now()}-${i}`,
          type: 'pdf-imported',
          source: {
            file: file.name,
            pageIndex: i - 1
          },
          blob: blob,
          url: URL.createObjectURL(blob),
          w: viewport.width,
          h: viewport.height,
          rotation: 0,
          name: `${file.name} - Page ${i}`,
          quality: null,
          ocr: null,
          edited: false // Track if page was edited (cropped/enhanced)
        };

        pages.push(pageObj);
      }

      return pages;
    } catch (error) {
      console.error('PDF import error:', error);
      throw new Error(`Failed to import PDF: ${error.message}`);
    }
  }

  /**
   * Render a single PDF page to canvas
   * @param {File} pdfFile - PDF file
   * @param {number} pageIndex - 0-based page index
   * @param {number} scale - Scale factor (default 2.0)
   * @returns {Promise<HTMLCanvasElement>}
   */
  async renderPageToCanvas(pdfFile, pageIndex, scale = 2.0) {
    try {
      await this.initialize();

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await this.pdfLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext('2d');
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      return canvas;
    } catch (error) {
      console.error('PDF page render error:', error);
      throw error;
    }
  }
}

// Create singleton instance
const pdfImportHandler = new PDFImportHandler();
