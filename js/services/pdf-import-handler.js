/** Bounded, cancellable rendering with a locally distributed PDF.js. */
class PDFImportHandler {
  constructor() { this.pdfLib = null; this.initializing = null; this.active = null; }
  async initialize() {
    if (this.pdfLib) return;
    if (!this.initializing) {
      this.initializing = this._loadPdfJS().then(lib => {
        lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs-dist-6.5.438/build/pdf.worker.min.mjs', document.baseURI).href;
        this.pdfLib = lib;
      }).catch(error => { this.initializing = null; throw error; });
    }
    await this.initializing;
  }
  _loadPdfJS() { return import(new URL('vendor/pdfjs-dist-6.5.438/build/pdf.min.mjs', document.baseURI).href); }
  cancel() { this.active?.abort(); }
  async _withPDF(file, options, run) {
    validateFileSize(file);
    if (this.active) throw new Error('Another PDF is being processed. Please wait.');
    const controller = new AbortController();
    this.active = controller;
    const signal = controller.signal;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(abort, SECURITY_LIMITS.operationTimeout);
    let task, destroyPromise;
    const destroy = () => {
      if (task && !destroyPromise) destroyPromise = Promise.resolve().then(() => task.destroy()).catch(() => {});
      return destroyPromise;
    };
    signal.addEventListener('abort', destroy, { once: true });
    const guard = () => { if (signal.aborted) throw new Error('PDF processing cancelled or timed out.'); };
    try {
      guard(); await this.initialize(); guard();
      const data = await file.arrayBuffer();
      guard();
      if (data.byteLength > SECURITY_LIMITS.maxFileBytes) throw new Error('PDF exceeds the file size limit.');
      const header = new TextDecoder('ascii').decode(new Uint8Array(data, 0, Math.min(1024, data.byteLength)));
      if (!header.includes('%PDF-')) throw new Error('File is not a PDF.');
      const assetBase = new URL('vendor/pdfjs-dist-6.5.438/', document.baseURI);
      task = this.pdfLib.getDocument({
        data, isEvalSupported: false, enableScripting: false, enableXfa: false,
        maxImageSize: SECURITY_LIMITS.maxPixels, canvasMaxAreaInBytes: SECURITY_LIMITS.maxPixels * 4,
        cMapUrl: new URL('cmaps/', assetBase).href, cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', assetBase).href,
        wasmUrl: new URL('wasm/', assetBase).href, iccUrl: new URL('iccs/', assetBase).href,
      });
      const pdf = await task.promise;
      guard();
      const maxPages = Math.min(SECURITY_LIMITS.maxPages, options.maxPages ?? SECURITY_LIMITS.maxPages);
      if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > maxPages) {
        throw new Error('PDF exceeds the remaining page limit (100 pages per scan).');
      }
      return await run(pdf, guard);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      signal.removeEventListener('abort', destroy);
      await destroy();
      if (this.active === controller) this.active = null;
    }
  }
  async _render(pdf, index, scale, guard) {
    guard();
    const page = await pdf.getPage(index + 1);
    let canvas;
    try {
      guard();
      if (!Number.isFinite(scale) || scale <= 0 || scale > 2) throw new Error('Invalid PDF rendering scale.');
      const viewport = page.getViewport({ scale });
      validateDimensions(viewport.width, viewport.height);
      canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      guard();
      return canvas;
    } catch (error) {
      if (canvas) canvas.width = canvas.height = 0;
      throw error;
    } finally { page.cleanup(); }
  }
  async importPDF(file, onProgress, options = {}) {
    const pages = [];
    try {
      return await this._withPDF(file, options, async (pdf, guard) => {
        let totalPixels = 0, totalBytes = 0;
        for (let i = 0; i < pdf.numPages; i++) {
          guard(); onProgress?.(i + 1, pdf.numPages);
          const canvas = await this._render(pdf, i, 2, guard);
          try {
            totalPixels += canvas.width * canvas.height;
            if (totalPixels > SECURITY_LIMITS.maxImportPixels) throw new Error('PDF exceeds the total rendering budget.');
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            guard();
            if (!blob) throw new Error('Could not encode PDF page.');
            totalBytes += blob.size;
            if (totalBytes > Math.min(options.maxBytes ?? SECURITY_LIMITS.maxSessionBytes, SECURITY_LIMITS.maxSessionBytes)) {
              throw new Error('PDF exceeds the remaining scan memory budget.');
            }
            pages.push({ id: `pdf-${Date.now()}-${i}`, type: 'pdf-imported',
              source: { file: file.name, pageIndex: i }, blob, url: URL.createObjectURL(blob),
              w: canvas.width, h: canvas.height, rotation: 0, name: `${file.name} - Page ${i + 1}`,
              quality: null, ocr: null, edited: false });
          } finally { canvas.width = canvas.height = 0; }
        }
        guard(); return pages;
      });
    } catch (error) { pages.forEach(page => URL.revokeObjectURL(page.url)); throw error; }
  }
  async renderPageToCanvas(file, index, scale = 2, options = {}) {
    let canvas;
    try {
      return await this._withPDF(file, options, async (pdf, guard) => {
        if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) throw new Error('Invalid PDF page.');
        canvas = await this._render(pdf, index, scale, guard);
        guard(); return canvas;
      });
    } catch (error) { if (canvas) canvas.width = canvas.height = 0; throw error; }
  }
}
const pdfImportHandler = new PDFImportHandler();
