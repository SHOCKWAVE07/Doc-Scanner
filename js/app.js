"use strict";

const $ = id => document.getElementById(id);
const cameraInput=$("cameraInput"), galleryInput=$("galleryInput"), pdfInput=$("pdfInput");
const cameraBtn=$("cameraBtn"), galleryBtn=$("galleryBtn"), importPdfBtn=$("importPdfBtn");
const selectionCard=$("selectionCard"), editor=$("editor"), sourceCanvas=$("sourceCanvas");
const svg=$("selectionSvg"), quadEl=$("quad"), statusEl=$("status"), progressEl=$("progress");
const pagesEl=$("pages"), emptyEl=$("empty"), pageCountEl=$("pageCount");
const pdfBtn=$("pdfBtn"), clearAllBtn=$("clearAll"), toastEl=$("toast");
const previewModal=$("previewModal"), previewImage=$("previewImage"), previewTitle=$("previewTitle");
const optimizeBtn=$("optimizeBtn"), sizeInfo=$("sizeInfo"), beforeSizeEl=$("beforeSize"), afterSizeEl=$("afterSize"), sizeSavingEl=$("sizeSaving");
const exportModal=$("exportModal"), exportNameEl=$("exportName"), exportPdfEl=$("exportPdf"), exportImagesEl=$("exportImages"), exportImagesOption=$("exportImagesOption"), exportZipOption=$("exportZipOption"), exportZipEl=$("exportZip");
const ocrModal=$("ocrModal"), ocrTitle=$("ocrTitle"), ocrStatus=$("ocrStatus"), ocrText=$("ocrText");
// New UI elements
const qualityFeedback=$("qualityFeedback"), qualityBadge=$("qualityBadge"), qualityBlur=$("qualityBlur"), qualityBlurPct=$("qualityBlurPct");
const qualityReadability=$("qualityReadability"), qualityReadabilityPct=$("qualityReadabilityPct"), qualityMessage=$("qualityMessage");
const compressionSelector=$("compressionSelector"), profileSelect=$("profileSelect"), profileHint=$("profileHint");
const scanModeSelector=$("scanModeSelector"), scanModeSelect=$("scanModeSelect"), modeHint=$("modeHint");
const adjustmentsPanel=$("adjustmentsPanel"), resetAdjustmentsBtn=$("resetAdjustments");
const brightnessSlider=$("brightnessSlider"), contrastSlider=$("contrastSlider"), sharpnessSlider=$("sharpnessSlider"), exposureSlider=$("exposureSlider");
const brightnessValue=$("brightnessValue"), contrastValue=$("contrastValue"), sharpnessValue=$("sharpnessValue"), exposureValue=$("exposureValue");
const magnifier=$("magnifier"), magnifierCanvas=$("magnifierCanvas");

let cvReady=false, scanner=null, currentImage=null, currentImageURL=null;
let fileQueue=[];
let corners=[], detectedCorners=[], currentFileName="", dragIndex=-1;
let draggedMidpointIndex=-1; // Track which midpoint is being dragged
let pages=[], previewIndex=-1;
let pendingOptimized=null;
let draggedPageIndex=-1;
let pagePointerDrag=null;
let isAutoRotating=false;

// UI State
let selectedCompressionProfile = "balanced";

// Initialize services
let logger, qualityValidator, orientationDetector, enhancementEngine, compressionProfiles;
let stabilityDetector, autoCaptureManager, cameraStreamManager;
let cropUIManager, magnifierUI;
let appState;

function setStatus(s,p=null){
  statusEl.textContent=s;
  if(p!==null) progressEl.style.width=p+"%";
}
function toast(s){
  toastEl.textContent=s; toastEl.classList.add("show");
  clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove("show"),2200);
}
function waitForCV(){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const t=setInterval(()=>{
      if(window.cv && typeof cv.Mat==="function" && window.jscanify && window.jspdf && window.jspdf.jsPDF){
        clearInterval(t); resolve();
      } else if(Date.now()-start>45000){
        clearInterval(t); reject(new Error("OpenCV, jscanify, or jsPDF did not load. Check your internet connection."));
      }
    },100);
  });
}
waitForCV().then(()=>{
  // Initialize services
  logger = new Logger(SCANNER_CONFIG);
  qualityValidator = new QualityValidator(SCANNER_CONFIG);
  orientationDetector = new OrientationDetector(SCANNER_CONFIG);
  enhancementEngine = new EnhancementEngine(SCANNER_CONFIG);
  compressionProfiles = new CompressionProfiles(SCANNER_CONFIG);
  
  // Phase 2 Services
  stabilityDetector = new StabilityDetector(SCANNER_CONFIG);
  autoCaptureManager = new AutoCaptureManager(SCANNER_CONFIG);
  cameraStreamManager = new CameraStreamManager(SCANNER_CONFIG);
  
  // Phase 3 UI Managers
  cropUIManager = new CropUIManager(SCANNER_CONFIG);
  magnifierUI = new MagnifierUI(SCANNER_CONFIG);
  
  appState = new ApplicationState();
  
  // Setup UI
  scanner=new jscanify();
  setupProfileSelector();
  setupAdjustmentSliders();
  setupAutoCapture();
  
  cvReady=true; 
  setStatus("Ready. Take a photo or add multiple photos.",0);
}).catch(e=>setStatus(e.message,0));

function setupProfileSelector(){
  if(!profileSelect) return;
  
  profileSelect.onchange = (e) => {
    selectedCompressionProfile = e.target.value;
    const profiles = compressionProfiles.getAllProfiles();
    const selected = profiles.find(p => p.id === selectedCompressionProfile);
    if(selected && profileHint){
      profileHint.textContent = selected.description;
    }
  };
  
  // Show hints for each profile on hover
  const hints = {
    highQuality: "Best for documents requiring high readability, larger file size (~1-2MB per page)",
    balanced: "Good balance of quality and file size (~300-800KB per page)",
    smallSize: "Smallest files for storage/sharing (~100-300KB per page)"
  };
  
  profileSelect.onmouseover = (e) => {
    const value = e.target.value;
    if(hints[value]) profileHint.textContent = hints[value];
  };
  
  // Setup scan mode selector
  if(scanModeSelect){
    scanModeSelect.onchange = (e) => {
      const scanMode = e.target.value;
      appState.currentScanMode = scanMode;
      const modeConfig = SCANNER_CONFIG.scanModes[scanMode];
      if(modeConfig && modeHint){
        modeHint.textContent = modeConfig.label + " mode - " + 
          (scanMode === "document" ? "Optimized for regular documents" :
           scanMode === "book" ? "Handles page curvature & spine" :
           scanMode === "idCard" ? "Small format with high clarity" :
           scanMode === "passport" ? "Passport page optimization" :
           scanMode === "whiteboard" ? "Glare & perspective correction" :
           "Preserves photographic appearance");
      }
    };
  }
}

function setupAdjustmentSliders(){
  if(!brightnessSlider) return;
  
  // Setup event listeners for real-time preview
  brightnessSlider.oninput = (e) => {
    updateAdjustmentValue(brightnessSlider, brightnessValue);
    if(currentImage && sourceCanvas){
      applyAdjustments(
        sourceCanvas,
        parseInt(brightnessSlider.value),
        parseInt(contrastSlider.value),
        parseInt(sharpnessSlider.value),
        parseInt(exposureSlider.value)
      );
      redrawSelection();
    }
  };
  
  contrastSlider.oninput = (e) => {
    updateAdjustmentValue(contrastSlider, contrastValue);
    if(currentImage && sourceCanvas){
      applyAdjustments(
        sourceCanvas,
        parseInt(brightnessSlider.value),
        parseInt(contrastSlider.value),
        parseInt(sharpnessSlider.value),
        parseInt(exposureSlider.value)
      );
      redrawSelection();
    }
  };
  
  sharpnessSlider.oninput = (e) => {
    updateAdjustmentValue(sharpnessSlider, sharpnessValue);
    if(currentImage && sourceCanvas){
      applyAdjustments(
        sourceCanvas,
        parseInt(brightnessSlider.value),
        parseInt(contrastSlider.value),
        parseInt(sharpnessSlider.value),
        parseInt(exposureSlider.value)
      );
      redrawSelection();
    }
  };
  
  exposureSlider.oninput = (e) => {
    updateAdjustmentValue(exposureSlider, exposureValue);
    if(currentImage && sourceCanvas){
      applyAdjustments(
        sourceCanvas,
        parseInt(brightnessSlider.value),
        parseInt(contrastSlider.value),
        parseInt(sharpnessSlider.value),
        parseInt(exposureSlider.value)
      );
      redrawSelection();
    }
  };
  
  // Reset button
  resetAdjustmentsBtn.onclick = () => {
    resetAllAdjustments();
  };
}

function displayQualityFeedback(qualityResult){
  if(!qualityFeedback || !qualityResult) return;
  
  // Show the quality section
  qualityFeedback.style.display = "block";
  
  // Update badge
  let badgeText = "Poor";
  let badgeColor = "red";
  
  const score = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const sharpnessScore = score(qualityResult.blurScore);
  const readabilityScore = score(qualityResult.readabilityScore);

  if(readabilityScore >= 0.8){
    badgeText = "Excellent";
    badgeColor = "green";
  } else if(readabilityScore >= 0.6){
    badgeText = "Good";
    badgeColor = "blue";
  } else if(readabilityScore >= 0.4){
    badgeText = "Fair";
    badgeColor = "orange";
  }
  
  qualityBadge.textContent = badgeText;
  qualityBadge.style.color = badgeColor;
  
  // Update progress bars
  const blurPercent = Math.round(sharpnessScore * 100);
  const readabilityPercent = Math.round(readabilityScore * 100);
  
  qualityBlur.style.width = blurPercent + "%";
  qualityBlurPct.textContent = blurPercent + "%";
  qualityReadability.style.width = readabilityPercent + "%";
  qualityReadabilityPct.textContent = readabilityPercent + "%";
  
  // Update message
  if(qualityResult.isAcceptable && readabilityScore >= SCANNER_CONFIG.quality.readabilityThreshold){
    qualityMessage.textContent = "Image quality is acceptable for scanning";
    qualityMessage.style.color = "green";
  } else {
    qualityMessage.textContent = qualityResult.getDetailedReason() || "Image quality is below recommended threshold";
    qualityMessage.style.color = "orange";
  }
}

// Apply image adjustments (brightness, contrast, sharpness, exposure)
function applyAdjustments(sourceCanvas, brightness, contrast, sharpness, exposure) {
  if (!sourceCanvas) return;
  
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = sourceCanvas.width;
  tempCanvas.height = sourceCanvas.height;
  const tempCtx = tempCanvas.getContext("2d");
  
  // Always start from the untouched image so slider changes are reversible.
  if (currentImage) {
    tempCtx.drawImage(currentImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
  } else {
    tempCtx.drawImage(sourceCanvas, 0, 0);
  }
  
  // Get image data
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;
  
  // Apply adjustments per pixel
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    
    // Brightness (add/subtract)
    r = Math.max(0, Math.min(255, r + brightness));
    g = Math.max(0, Math.min(255, g + brightness));
    b = Math.max(0, Math.min(255, b + brightness));
    
    // Contrast (multiply around 128)
    const contrastFactor = (contrast + 100) / 100;
    r = Math.max(0, Math.min(255, (r - 128) * contrastFactor + 128));
    g = Math.max(0, Math.min(255, (g - 128) * contrastFactor + 128));
    b = Math.max(0, Math.min(255, (b - 128) * contrastFactor + 128));
    
    // Exposure (similar to brightness but non-linear)
    const exposureFactor = exposure / 50;
    r = Math.max(0, Math.min(255, r * (1 + exposureFactor)));
    g = Math.max(0, Math.min(255, g * (1 + exposureFactor)));
    b = Math.max(0, Math.min(255, b * (1 + exposureFactor)));
    
    data[i] = r;
    data[i+1] = g;
    data[i+2] = b;
    data[i+3] = a;
  }
  
  // Sharpness via unsharp masking (simplified)
  if (sharpness > 0) {
    const sharpAmount = sharpness / 100;
    tempCtx.putImageData(imageData, 0, 0);
    
    // Get blurred copy
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = tempCanvas.width;
    blurCanvas.height = tempCanvas.height;
    const blurCtx = blurCanvas.getContext("2d");
    blurCtx.filter = "blur(2px)";
    blurCtx.drawImage(tempCanvas, 0, 0);
    
    // Blend original with inverted blur to sharpen
    tempCtx.globalAlpha = sharpAmount;
    tempCtx.drawImage(tempCanvas, 0, 0);
    tempCtx.globalAlpha = -sharpAmount / 2;
    tempCtx.drawImage(blurCanvas, 0, 0);
    tempCtx.globalAlpha = 1.0;
  } else {
    tempCtx.putImageData(imageData, 0, 0);
  }
  
  // Copy back to source
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(tempCanvas, 0, 0);
}

// Update adjustment value display
function updateAdjustmentValue(slider, valueDisplay) {
  valueDisplay.textContent = slider.value;
}

function resetAllAdjustments() {
  brightnessSlider.value = 0;
  contrastSlider.value = 0;
  sharpnessSlider.value = 0;
  exposureSlider.value = 0;
  
  updateAdjustmentValue(brightnessSlider, brightnessValue);
  updateAdjustmentValue(contrastSlider, contrastValue);
  updateAdjustmentValue(sharpnessSlider, sharpnessValue);
  updateAdjustmentValue(exposureSlider, exposureValue);
  
  // Re-render canvas
  if (currentImage && sourceCanvas) {
    const ctx = sourceCanvas.getContext("2d");
    ctx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    ctx.drawImage(currentImage, 0, 0);
    redrawSelection();
  }
}

// Redraw selection handles and SVG
function redrawSelection() {
  renderCorners();
}

// Setup Auto Capture (Phase 2)
function setupAutoCapture() {
  const autoCaptureToggle = $("autoCaptureToggle");
  const autoCaptureStatus = $("autoCaptureStatus");
  const statusIndicator = $("statusIndicator");
  const statusText = $("statusText");
  const cameraStream = $("cameraStream");
  const previewCanvas = $("previewCanvas");
  const cameraStage = $("cameraStage");
  const cameraGuide = $("cameraGuide");
  const cameraGuidePolygon = $("cameraGuidePolygon");
  const cameraGuideLabel = $("cameraGuideLabel");
  let latestCameraFrame = null;

  function updateCameraGuide(frame) {
    if (!cameraGuide || !cameraGuidePolygon || !frame.canvas) return;
    if (!frame.detectedCorners || frame.detectedCorners.length !== 4) {
      cameraGuide.classList.remove("detected", "ready");
      cameraGuidePolygon.setAttribute("points", "");
      cameraGuideLabel.textContent = "Point the camera at a document";
      return;
    }

    const points = frame.detectedCorners.map((point) => (
      `${(point.x / frame.canvas.width) * 100},${(point.y / frame.canvas.height) * 100}`
    )).join(" ");
    cameraGuidePolygon.setAttribute("points", points);
    cameraGuide.classList.add("detected");
    cameraGuideLabel.textContent = "Document found — hold steady...";
  }

  // Initialize magnifier UI
  if (magnifier) {
    magnifierUI.initialize(magnifier);
    magnifierUI.enablePinchZoom((zoomLevel) => {
      logger.info("Magnifier zoom changed", { zoomLevel });
    });
  }

  // Initialize crop UI manager with callback
  if (sourceCanvas && svg && quadEl) {
    cropUIManager.setOnCropChange((newCorners) => {
      corners = newCorners;
      // Update quality feedback
      if (sourceCanvas) {
        const quality = qualityValidator.validateImage(sourceCanvas);
        displayQualityFeedback(quality);
      }
    });
  }

  // Auto capture toggle handler
  if (autoCaptureToggle) {
    autoCaptureToggle.addEventListener("change", async (e) => {
      if (e.target.checked) {
        try {
          await setupCameraPreview(cameraStream, previewCanvas);
          cameraStage.style.aspectRatio = `${cameraStream.videoWidth}/${cameraStream.videoHeight}`;
          cameraStage.hidden = false;
          cameraStreamManager.start(async (frame) => {
            latestCameraFrame = frame.canvas;
            updateCameraGuide(frame);
            const result = await autoCaptureManager.processFrame(
              frame.canvas,
              frame.detectedCorners,
              frame.confidence
            );
            if (result.shouldCapture) {
              cameraGuide.classList.remove("detected");
              cameraGuide.classList.add("ready");
              cameraGuideLabel.textContent = "Document aligned. Capturing...";
            }
            if (result.shouldCapture) await autoCaptureManager.capture();
          });
          autoCaptureManager.enable();
          autoCaptureStatus.style.display = "flex";
          toast("Auto Capture enabled");
          logger.info("Auto Capture enabled");
        } catch (error) {
          e.target.checked = false;
          autoCaptureStatus.style.display = "none";
          toast(error.message || "Camera could not be started");
          logger.warn("Auto Capture camera start failed", { error: error.message });
        }
      } else {
        autoCaptureManager.disable();
        cameraStreamManager.stop();
        cameraStage.hidden = true;
        autoCaptureStatus.style.display = "none";
        toast("Auto Capture disabled");
        logger.info("Auto Capture disabled");
      }
    });
  }

  // Auto capture callbacks
  autoCaptureManager.setOnCapture(async () => {
    logger.info("Auto capture triggered");
    if (statusIndicator) statusIndicator.classList.remove("searching", "detected", "unstable");
    
    if (fileQueue.length > 0 && !currentImage) {
      const next = fileQueue.shift();
      if (next) {
        await openForSelection(next);
      }
    } else if (!currentImage && latestCameraFrame) {
      const capturedFrame = cameraStreamManager.captureFrame() || latestCameraFrame;
      const blob = await new Promise((resolve) => {
        capturedFrame.toBlob(resolve, "image/jpeg", 0.95);
      });
      if (!blob) throw new Error("Could not capture a camera frame");
      await openForSelection(new File([blob], `Camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      await addCurrentPage();
    } else if (currentImage && corners.length === 4) {
      // Auto-crop and add to pages
      await addCurrentPage();
    }

    // A document stays stable in view after capture. End this one-shot camera
    // session so it cannot add the same page again on the next stable frames.
    autoCaptureManager.disable();
    cameraStreamManager.stop();
    cameraStage.hidden = true;
    autoCaptureToggle.checked = false;
    autoCaptureStatus.style.display = "none";
    toast("Document captured");
  });

  autoCaptureManager.setOnStatusChange((status) => {
    updateAutoCaptureStatus(status, statusIndicator, statusText, statusEl);
  });

  // Camera permission and frame processing start when Auto Capture is enabled.
}

// Update UI based on auto capture status
function updateAutoCaptureStatus(status, statusIndicator, statusText, statusEl) {
  const message = autoCaptureManager.getStatusMessage();
  
  // Update status display
  if (statusEl) {
    statusEl.textContent = message;
    
    // Update CSS class for styling
    statusEl.className = "status";
    switch (status) {
      case "SEARCHING":
        statusEl.classList.add("searching");
        break;
      case "DOCUMENT_DETECTED":
        statusEl.classList.add("document_detected");
        break;
      case "UNSTABLE":
        statusEl.classList.add("unstable");
        break;
      case "READY":
        statusEl.classList.add("ready");
        break;
      case "BLURRY":
        statusEl.classList.add("blurry");
        break;
      case "CAPTURED":
        statusEl.classList.add("captured");
        break;
    }
  }

  // Update status indicator
  if (statusIndicator) {
    statusIndicator.className = "status-indicator";
    statusIndicator.classList.add(status.toLowerCase());
  }

  if (statusText) {
    statusText.textContent = message;
  }

  logger.debug("Auto capture status changed", { status, message });
}

// Setup camera preview (Phase 2 enhancement)
async function setupCameraPreview(videoElement, previewCanvas) {
  // This can be called later to enable camera preview with live detection
  // For now, it's set up but not automatically activated
  try {
    await cameraStreamManager.initialize(videoElement, previewCanvas, scanner);
    logger.info("Camera preview initialized");
  } catch (e) {
    logger.warn("Camera preview initialization failed", { error: e.message });
    throw e;
  }
}

// Add current page to document
async function addCurrentPage() {
  if (!currentImage || !corners || corners.length !== 4) {
    toast("Please adjust document boundaries first");
    return;
  }

  setStatus("Processing document…", 50);

  try {
    // Perform perspective correction
    const processedImage = await perspectiveCorrect(sourceCanvas, corners);

    // Apply auto enhancements
    const enhanced = enhancementEngine.enhance(processedImage, appState.currentScanMode || "document");

    // Validate quality
    const quality = qualityValidator.validateImage(enhanced.canvas);
    
    if (!quality.isAcceptable) {
      logger.warn("Document quality below threshold", { quality });
      toast("Document quality is below threshold. Please retake image.");
      return;
    }

    // Get selected compression profile
    const profile = compressionProfiles.getProfile(selectedCompressionProfile);

    // Compress image
    const compressed = await compressImage(enhanced.canvas, profile.jpegQuality);

    // Check if we're editing an existing page (Phase 6)
    const editingPageId = pdfPageManager.getEditingPage();
    
    if (editingPageId) {
      // Update existing page
      const pageIndex = pages.findIndex(p => p.id === editingPageId);
      if (pageIndex >= 0) {
        const oldPage = pages[pageIndex];
        URL.revokeObjectURL(oldPage.url);
        
        const updatedPage = {
          ...oldPage,
          blob: compressed.blob,
          url: URL.createObjectURL(compressed.blob),
          w: enhanced.canvas.width,
          h: enhanced.canvas.height,
          quality: quality,
          edited: true
        };
        
        pages[pageIndex] = updatedPage;
        renderPages();
        setStatus(`Page ${pageIndex + 1} updated`, 100);
        toast(`Page ${pageIndex + 1} updated (${(compressed.blob.size / 1024).toFixed(0)} KB)`);
        
        logger.info("Page edited", { pageId: editingPageId, size: compressed.blob.size, quality });
        
        pdfPageManager.clearEditingPage();
      }
    } else {
      // Create new page
      const pageId = Date.now() + Math.random().toString(36).slice(2, 9);
      const page = {
        id: pageId,
        type: 'scanned',
        blob: compressed.blob,
        url: URL.createObjectURL(compressed.blob),
        w: enhanced.canvas.width,
        h: enhanced.canvas.height,
        rotation: 0,
        name: `Page ${pages.length + 1}`,
        quality: quality,
      };

      pages.push(page);
      renderPages();
      setStatus(`Added: ${page.name}`, 100);
      toast(`${page.name} added (${(page.blob.size / 1024).toFixed(0)} KB)`);

      logger.info("Page added", { pageId, size: page.blob.size, quality });
    }

    // Clear for next image if in queue
    if (fileQueue.length > 0) {
      const next = fileQueue.shift();
      await openForSelection(next);
    } else {
      currentImage = null;
      selectionCard.style.display = "none";
    }
  } catch (e) {
    logger.error("Failed to add page", { error: e.message });
    toast("Error processing image: " + e.message);
    setStatus("Error: " + e.message, 0);
  }
}

// Perspective correction using corners
async function perspectiveCorrect(canvas, corners) {
  return new Promise((resolve) => {
    const src = cv.imread(canvas);
    const dst = new cv.Mat();
    
    // Create source points from corners
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32F, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y,
    ]);

    // Create destination points (full image size)
    const w = Math.max(
      Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y),
      Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)
    );
    const h = Math.max(
      Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y),
      Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)
    );

    const dstPoints = cv.matFromArray(4, 1, cv.CV_32F, [
      0, 0,
      w, 0,
      w, h,
      0, h,
    ]);

    try {
      const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
      cv.warpPerspective(src, dst, M, new cv.Size(w, h));

      // Create result canvas
      const resultCanvas = document.createElement("canvas");
      resultCanvas.width = w;
      resultCanvas.height = h;
      cv.imshow(resultCanvas, dst);

      M.delete();
      resolve(resultCanvas);
    } finally {
      src.delete();
      dst.delete();
      srcPoints.delete();
      dstPoints.delete();
    }
  });
}

// Compress image to blob
async function compressImage(canvas, quality = 0.78) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve({ blob, size: blob.size });
      },
      "image/jpeg",
      quality
    );
  });
}

cameraBtn.onclick=()=>cameraInput.click();
galleryBtn.onclick=()=>galleryInput.click();
importPdfBtn.onclick=()=>pdfInput.click();

cameraInput.onchange=e=>handleFiles([...e.target.files]);
galleryInput.onchange=e=>handleFiles([...e.target.files]);
pdfInput.onchange=e=>handlePdfImport([...e.target.files]);

async function handlePdfImport(files) {
  if (!files.length) return;

  const pdfFile = files[0];
  if (!pdfFile.type.includes('pdf')) {
    toast("Please select a PDF file");
    pdfInput.value = "";
    return;
  }

  try {
    setStatus("Importing PDF…", 10);
    importPdfBtn.disabled = true;

    const importedPages = await pdfImportHandler.importPDF(pdfFile, (current, total) => {
      const progress = 10 + (current / total) * 80;
      setStatus(`Importing PDF: ${current}/${total}…`, progress);
    });

    if (importedPages.length === 0) {
      toast("PDF has no pages");
      setStatus("Import failed", 0);
      return;
    }

    // Add imported pages to pages array
    importedPages.forEach(pageData => {
      pageData.type = 'pdf-imported';
      pages.push(pageData);
    });

    renderPages();
    setStatus(`Imported ${importedPages.length} page${importedPages.length > 1 ? "s" : ""} from PDF`, 100);
    toast(`PDF imported: ${importedPages.length} page${importedPages.length > 1 ? "s" : ""}`);

    logger.info("PDF imported", { fileName: pdfFile.name, pageCount: importedPages.length });
  } catch (e) {
    console.error("PDF import error:", e);
    toast("Failed to import PDF: " + e.message);
    setStatus("PDF import failed", 0);
  } finally {
    importPdfBtn.disabled = false;
    pdfInput.value = "";
  }
}

async function handleFiles(files){
  if(!files.length) return;
  let added=0;

  for(const file of files){
    if(!file.type.startsWith("image/")) continue;
    fileQueue.push(file);
    added++;
  }

  if(added===0) return;

  // If there's no image currently being edited, open the first queued image.
  if(!currentImage){
    const next=fileQueue.shift();
    if(next) await openForSelection(next);
  }else{
    toast(`${added} image${added>1?"s":""} queued`);
  }

  cameraInput.value=""; galleryInput.value="";
}

function loadImg(url){
  return new Promise((resolve,reject)=>{
    const im=new Image();
    im.onload=()=>resolve(im); im.onerror=()=>reject(new Error("Unable to read image."));
    im.src=url;
  });
}

async function openForSelection(file){
  if(!cvReady) return toast("Scanner is still loading.");
  if(currentImageURL) URL.revokeObjectURL(currentImageURL);
  currentFileName=file.name || "document";
  currentImageURL=URL.createObjectURL(file);
  currentImage=await loadImg(currentImageURL);
  pendingOptimized=null;
  sizeInfo.classList.remove("show");
  beforeSizeEl.textContent="—";
  afterSizeEl.textContent="—";
  sizeSavingEl.textContent="—";

  selectionCard.style.display="block";
  drawSource();
  await autoDetect();
  selectionCard.scrollIntoView({behavior:"smooth",block:"start"});
}

function drawSource(){
  const max=1800;
  const iw=currentImage.naturalWidth, ih=currentImage.naturalHeight;
  const scale=Math.min(1,max/Math.max(iw,ih));

  sourceCanvas.width=Math.max(1,Math.round(iw*scale));
  sourceCanvas.height=Math.max(1,Math.round(ih*scale));

  const ctx=sourceCanvas.getContext("2d",{willReadFrequently:true});
  ctx.clearRect(0,0,sourceCanvas.width,sourceCanvas.height);
  ctx.drawImage(currentImage,0,0,sourceCanvas.width,sourceCanvas.height);

  // The editor is shrink-wrapped to the displayed canvas, so the SVG and
  // handles cannot use a different coordinate system.
  editor.style.aspectRatio=`${sourceCanvas.width}/${sourceCanvas.height}`;
  svg.setAttribute("viewBox",`0 0 ${sourceCanvas.width} ${sourceCanvas.height}`);
  
  // Initialize 8-point crop UI (Phase 3)
  if (cropUIManager && sourceCanvas && svg && quadEl && magnifier) {
    const defaultCorners = [
      {x: sourceCanvas.width * 0.06, y: sourceCanvas.height * 0.06},
      {x: sourceCanvas.width * 0.94, y: sourceCanvas.height * 0.06},
      {x: sourceCanvas.width * 0.94, y: sourceCanvas.height * 0.94},
      {x: sourceCanvas.width * 0.06, y: sourceCanvas.height * 0.94}
    ];
    cropUIManager.initialize(sourceCanvas, svg, quadEl, defaultCorners, magnifier);
  }
  
  requestAnimationFrame(renderCorners);
}

function sourceMat(){
  return cv.imread(sourceCanvas);
}

function orderCorners(points){
  if(!points || points.length!==4) return null;

  const cx=points.reduce((s,p)=>s+p.x,0)/4;
  const cy=points.reduce((s,p)=>s+p.y,0)/4;

  const sorted=[...points].sort((a,b)=>
    Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx)
  );

  const tl=sorted.reduce(
    (best,p)=>p.x+p.y < best.x+best.y ? p : best,
    sorted[0]
  );

  const rest=sorted.filter(p=>p!==tl);
  const br=rest.reduce(
    (best,p)=>p.x+p.y > best.x+best.y ? p : best,
    rest[0]
  );

  const remaining=rest.filter(p=>p!==br);
  const tr=remaining[0].x>remaining[1].x ? remaining[0] : remaining[1];
  const bl=remaining[0].x>remaining[1].x ? remaining[1] : remaining[0];

  return [tl,tr,br,bl];
}

function isGoodQuad(q){
  if(!q || q.length!==4) return false;

  const area=Math.abs(q.reduce((s,p,i)=>{
    const n=q[(i+1)%4];
    return s+p.x*n.y-n.x*p.y;
  },0))/2;

  const imageArea=sourceCanvas.width*sourceCanvas.height;

  if(area < imageArea*0.12) return false;

  return q.every(p =>
    p.x>=0 && p.x<=sourceCanvas.width &&
    p.y>=0 && p.y<=sourceCanvas.height
  );
}

function fallbackContourCorners(mat){
  const gray=new cv.Mat();
  const blur=new cv.Mat();
  const edges=new cv.Mat();
  const contours=new cv.MatVector();
  const hierarchy=new cv.Mat();

  try{
    cv.cvtColor(mat,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    cv.Canny(blur,edges,50,150);

    const kernel=cv.Mat.ones(3,3,cv.CV_8U);
    cv.dilate(edges,edges,kernel);
    kernel.delete();

    cv.findContours(
      edges,contours,hierarchy,
      cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE
    );

    const imageArea=mat.rows*mat.cols;
    let best=null;
    let bestScore=0;

    for(let i=0;i<contours.size();i++){
      const c=contours.get(i);
      const area=cv.contourArea(c);

      if(area < imageArea*0.08) continue;

      const peri=cv.arcLength(c,true);
      const approx=new cv.Mat();

      cv.approxPolyDP(c,approx,0.03*peri,true);

      if(approx.rows===4 && cv.isContourConvex(approx)){
        const score=area/imageArea;

        if(score>bestScore){
          const pts=[];

          for(let r=0;r<4;r++){
            pts.push({
              x:approx.data32S[r*2],
              y:approx.data32S[r*2+1]
            });
          }

          best=orderCorners(pts);
          bestScore=score;
        }
      }

      approx.delete();
    }

    return best;
  }finally{
    gray.delete();
    blur.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function defaultCorners(){
  const m=0.06;

  return [
    {x:sourceCanvas.width*m,y:sourceCanvas.height*m},
    {x:sourceCanvas.width*(1-m),y:sourceCanvas.height*m},
    {x:sourceCanvas.width*(1-m),y:sourceCanvas.height*(1-m)},
    {x:sourceCanvas.width*m,y:sourceCanvas.height*(1-m)}
  ];
}

async function autoDetect({skipOrientation=false}={}){
  if(!scanner || !currentImage || !cvReady) return;

  setStatus("Detecting paper…",25);

  let mat=null;
  let contour=null;

  try{
    mat=sourceMat();

    let detected=null;

    // Primary detector: jscanify.
    contour=scanner.findPaperContour(mat);

    if(contour && !contour.empty()){
      const cp=scanner.getCornerPoints(contour);

      detected=orderCorners([
        cp.topLeftCorner,
        cp.topRightCorner,
        cp.bottomRightCorner,
        cp.bottomLeftCorner
      ].map(p=>({x:p.x,y:p.y})));
    }

    // If jscanify returns a poor rectangle, use a true 4-point
    // quadrilateral contour detector.
    if(!isGoodQuad(detected)){
      detected=fallbackContourCorners(mat);
    }

    if(isGoodQuad(detected)){
      detectedCorners=detected;
      corners=detected.map(p=>({...p}));

      // Update crop UI manager with detected corners (Phase 3)
      if (cropUIManager) {
        cropUIManager.setCorners(corners);
      }

      renderCorners();
      setStatus(
        "4 corners detected. Drag them to the exact document corners.",
        45
      );
      
      // Detect orientation and auto-rotate if configured
      if (!skipOrientation && !isAutoRotating) {
        await detectAndApplyOrientation(mat);
      }
    }else{
      detectedCorners=[];
      corners=defaultCorners();

      // Update crop UI manager with default corners (Phase 3)
      if (cropUIManager) {
        cropUIManager.setCorners(corners);
      }

      renderCorners();
      setStatus(
        "No reliable document boundary found. Set the 4 points manually.",
        35
      );
    }
  }catch(e){
    console.error("Auto-detect error:",e);

    detectedCorners=[];
    corners=defaultCorners();

    // Update crop UI manager with default corners (Phase 3)
    if (cropUIManager) {
      cropUIManager.setCorners(corners);
    }

    renderCorners();
    setStatus("Detection failed. Set the 4 points manually.",35);
  }finally{
    if(contour) contour.delete();
    if(mat) mat.delete();
  }
}

async function detectAndApplyOrientation(mat){
  if(!orientationDetector || !SCANNER_CONFIG.orientation.autoDetectEnabled){
    return;
  }

  try{
    setStatus("Checking document orientation…", 50);
    
    // Create a canvas from the detected region for orientation analysis
    const orientationCanvas = document.createElement("canvas");
    orientationCanvas.width = sourceCanvas.width;
    orientationCanvas.height = sourceCanvas.height;
    cv.imshow(orientationCanvas, mat);
    
    const orientationResult = orientationDetector.detectOrientation(
      orientationCanvas,
      "portrait" // Expected default
    );

    logger?.info("Orientation detected", {
      detected: orientationResult.detectedOrientation,
      confidence: orientationResult.confidence,
      requiresRotation: orientationResult.requiresRotation
    });

    if(
      orientationResult.requiresRotation && 
      orientationResult.confidence >= SCANNER_CONFIG.orientation.rotationThreshold &&
      SCANNER_CONFIG.orientation.autoRotateEnabled
    ){
      // Auto-rotate the image
      await autoRotateImage(orientationResult.rotationAngle);
      toast("Document auto-rotated to correct orientation");
      setStatus("Document rotated. 4 corners detected. Drag to adjust if needed.", 55);
    }else{
      setStatus("4 corners detected. Drag them to the exact document corners.", 45);
    }
  }catch(e){
    logger?.warn("Orientation detection failed", {error: e.message});
    // Continue without rotation - not a critical failure
    setStatus("4 corners detected. Drag them to the exact document corners.", 45);
  }
}

async function autoRotateImage(angle){
  if(!orientationDetector || !currentImage || isAutoRotating){
    return;
  }

  try{
    isAutoRotating=true;
    // Rotate the source canvas
    const rotatedCanvas = await orientationDetector.rotateCanvas(sourceCanvas, angle);
    
    // Update the display
    const ctx = sourceCanvas.getContext("2d");
    sourceCanvas.width = rotatedCanvas.width;
    sourceCanvas.height = rotatedCanvas.height;
    ctx.drawImage(rotatedCanvas, 0, 0);
    
    // Update the layout
    editor.style.aspectRatio = `${sourceCanvas.width}/${sourceCanvas.height}`;
    svg.setAttribute("viewBox", `0 0 ${sourceCanvas.width} ${sourceCanvas.height}`);
    
    // Re-detect corners on rotated image
    await autoDetect({skipOrientation:true});
  }catch(e){
    logger?.error("Auto-rotation failed", {error: e.message});
    toast("Could not rotate image");
  }finally{
    isAutoRotating=false;
  }
}

function renderCorners(){
  if(!corners.length || !sourceCanvas.width || !sourceCanvas.height) return;

  // Use CropUIManager for rendering if available (Phase 3)
  if (cropUIManager && sourceCanvas && svg && quadEl && magnifier) {
    cropUIManager.setCorners(corners);
    cropUIManager.render();
  } else {
    // Fallback: Legacy rendering
    quadEl.setAttribute(
      "points",
      corners.map(p=>`${p.x},${p.y}`).join(" ")
    );

    corners.forEach((p,i)=>{
      const el=$("c"+i);
      el.style.left=(p.x/sourceCanvas.width*100)+"%";
      el.style.top=(p.y/sourceCanvas.height*100)+"%";
    });
    
    renderMidpoints();
  }
}

// Calculate and render midpoint handles
function renderMidpoints(){
  if(corners.length < 4 || !sourceCanvas.width || !sourceCanvas.height) return;
  
  // Midpoints: 0=top, 1=right, 2=bottom, 3=left
  const midpoints = calculateMidpoints(corners);
  
  midpoints.forEach((p, i) => {
    const el = $("m" + i);
    if(el){
      el.style.left = (p.x / sourceCanvas.width * 100) + "%";
      el.style.top = (p.y / sourceCanvas.height * 100) + "%";
    }
  });
}

// Calculate midpoint positions based on corners
function calculateMidpoints(corners){
  const mids = [];
  // Top midpoint (between c0 and c1)
  mids.push({x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2});
  // Right midpoint (between c1 and c2)
  mids.push({x: (corners[1].x + corners[2].x) / 2, y: (corners[1].y + corners[2].y) / 2});
  // Bottom midpoint (between c2 and c3)
  mids.push({x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2});
  // Left midpoint (between c3 and c0)
  mids.push({x: (corners[3].x + corners[0].x) / 2, y: (corners[3].y + corners[0].y) / 2});
  return mids;
}

window.addEventListener("resize",()=>{
  requestAnimationFrame(renderCorners);
});

$("resetCorners").onclick=()=>{
  pendingOptimized=null;
  sizeInfo.classList.remove("show");
  if(detectedCorners.length) corners=detectedCorners.map(p=>({...p}));
  else autoDetect();
  renderCorners();
};

function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function quadSize(){
  const w=Math.max(distance(corners[0],corners[1]),distance(corners[3],corners[2]));
  const h=Math.max(distance(corners[0],corners[3]),distance(corners[1],corners[2]));
  return {w:Math.max(1,Math.round(w)),h:Math.max(1,Math.round(h))};
}

async function enhanceDocument(out){
  // Use the new EnhancementEngine for better, more modular enhancement
  if(!enhancementEngine){
    // Fallback to original simple enhancement if engine not ready
    const denoised=new cv.Mat();
    const blurred=new cv.Mat();
    const sharpened=new cv.Mat();

    try{
      cv.GaussianBlur(out,denoised,new cv.Size(3,3),0);
      cv.addWeighted(out,1.45,denoised,-0.45,0,sharpened);
      return sharpened.clone();
    }finally{
      denoised.delete();
      blurred.delete();
      sharpened.delete();
    }
  }

  try{
    const profile = SCANNER_CONFIG.scanModes[appState?.currentScanMode || 'document'];
    const enhancementProfile = SCANNER_CONFIG.compressionProfiles[profile?.enhancementProfile || 'balanced'];
    
    // Apply enhancement based on scan mode
    return enhancementEngine.enhanceDocument(out, {
      mode: profile?.enhancementProfile || 'balanced',
      enableShadowRemoval: true,
      enableSharpening: true,
      enableNoiseReduction: true,
      enableContrastBoost: profile?.contrastBoost ? true : false,
      contrastBoost: profile?.contrastBoost || 1.2
    });
  }catch(e){
    logger?.warn("Enhancement error", {error: e.message});
    // Fallback to simple sharpening
    const denoised=new cv.Mat();
    const sharpened=new cv.Mat();
    try{
      cv.GaussianBlur(out,denoised,new cv.Size(3,3),0);
      cv.addWeighted(out,1.45,denoised,-0.45,0,sharpened);
      return sharpened.clone();
    }finally{
      denoised.delete();
      sharpened.delete();
    }
  }
}

function formatBytes(bytes){
  if(compressionProfiles){
    return compressionProfiles.formatBytes(bytes);
  }
  // Fallback
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(2)} MB`;
}

async function canvasToBlob(canvas,quality){
  return await new Promise((resolve,reject)=>{
    canvas.toBlob(
      b=>b ? resolve(b) : reject(new Error("Could not encode image.")),
      "image/jpeg",
      quality
    );
  });
}

async function buildScanVariants(profileName = 'balanced'){
  const {w,h}=quadSize();
  const mat=sourceMat();
  const srcTri=cv.matFromArray(4,1,cv.CV_32FC2,[
    corners[0].x,corners[0].y,
    corners[1].x,corners[1].y,
    corners[3].x,corners[3].y,
    corners[2].x,corners[2].y
  ]);
  const dstTri=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,0,h-1,w-1,h-1]);
  const M=cv.getPerspectiveTransform(srcTri,dstTri);
  const out=new cv.Mat();

  try{
    cv.warpPerspective(
      mat,out,M,new cv.Size(w,h),
      cv.INTER_CUBIC,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255)
    );

    const rawCanvas=document.createElement("canvas");
    rawCanvas.width=w;
    rawCanvas.height=h;
    cv.imshow(rawCanvas,out);
    const rawBlob=await canvasToBlob(rawCanvas,0.95);

    const enhanced=await enhanceDocument(out);
    try{
      // Use compression profile to determine final size
      const profile = compressionProfiles ? compressionProfiles.getProfile(profileName) : null;
      const MAX_OUTPUT_SIDE = profile?.resizeThreshold || 1800;
      
      const resizeScale=Math.min(1,MAX_OUTPUT_SIDE/Math.max(enhanced.cols,enhanced.rows));
      const finalW=Math.max(1,Math.round(enhanced.cols*resizeScale));
      const finalH=Math.max(1,Math.round(enhanced.rows*resizeScale));

      const resized=new cv.Mat();
      try{
        if(resizeScale!==1){
          cv.resize(enhanced,resized,new cv.Size(finalW,finalH),0,0,cv.INTER_AREA);
        }else{
          enhanced.copyTo(resized);
        }

        // Apply quality validation
        const optimizedCanvas=document.createElement("canvas");
        optimizedCanvas.width=finalW;
        optimizedCanvas.height=finalH;
        cv.imshow(optimizedCanvas,resized);

        // Validate quality if service available
        let qualityResult = null;
        if(qualityValidator){
          qualityResult = qualityValidator.validateImage(optimizedCanvas);
          logger?.info("Quality validation", {
            isAcceptable: qualityResult.isAcceptable,
            blur: qualityResult.blurScore,
            readability: qualityResult.readabilityScore
          });
        }

        // Use appropriate compression quality from profile
        const jpegQuality = profile?.jpegQuality || 0.78;
        const optimizedBlob=await canvasToBlob(optimizedCanvas, jpegQuality);

        return {
          rawBlob,
          optimizedBlob,
          width:finalW,
          height:finalH,
          rawWidth:w,
          rawHeight:h,
          qualityResult,
          profileName
        };
      }finally{
        resized.delete();
      }
    }finally{
      enhanced.delete();
    }
  }finally{
    mat.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
    out.delete();
  }
}

optimizeBtn.onclick=async()=>{
  if(corners.length!==4 || !currentImage) return;

  optimizeBtn.disabled=true;
  setStatus("Enhancing text and compressing image…",70);

  try{
    const result=await buildScanVariants(selectedCompressionProfile);
    pendingOptimized=result;

    beforeSizeEl.textContent=formatBytes(result.rawBlob.size);
    afterSizeEl.textContent=formatBytes(result.optimizedBlob.size);

    const saved=Math.max(0,result.rawBlob.size-result.optimizedBlob.size);
    const pct=result.rawBlob.size
      ? Math.round(saved/result.rawBlob.size*100)
      : 0;

    sizeSavingEl.textContent=
      `${formatBytes(saved)} smaller (${pct}% reduction)`;

    sizeInfo.classList.add("show");
    
    // Display quality feedback
    if(result.qualityResult){
      displayQualityFeedback(result.qualityResult);
      
      if(!result.qualityResult.isAcceptable){
        toast("⚠️ " + result.qualityResult.getDetailedReason());
      }
    }
    
    setStatus("Optimization complete. Review the size and quality, then save the page.",90);
    toast("Image enhanced and compressed");
  }catch(e){
    console.error(e);
    toast("Could not optimize image.");
    setStatus("Optimization failed.",0);
  }finally{
    optimizeBtn.disabled=false;
  }
};

$("saveSelection").onclick=async()=>{
  if(corners.length!==4 || !currentImage) return;

  $("saveSelection").disabled=true;
  optimizeBtn.disabled=true;
  setStatus("Preparing scanned page…",75);

  try{
    let result=pendingOptimized;

    if(!result){
      result=await buildScanVariants();
    }

    const blob=result.optimizedBlob;
    const url=URL.createObjectURL(blob);

    // Create page with enhanced metadata
    const page = {
      id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
      blob,
      url,
      w:result.width,
      h:result.height,
      rotation:0,
      name:currentFileName||("page-"+(pages.length+1)),
      originalSize:result.rawBlob.size,
      compressedSize:result.optimizedBlob.size,
      // Enhanced metadata
      scanMode: appState?.currentScanMode || "document",
      qualityScore: result.qualityResult ? {
        blur: result.qualityResult.blurScore,
        focus: result.qualityResult.focusScore,
        noise: result.qualityResult.noiseScore,
        readability: result.qualityResult.readabilityScore,
        isAcceptable: result.qualityResult.isAcceptable
      } : null,
      compressionProfile: result.profileName || "balanced",
      metadata: {
        capturedAt: new Date().toISOString(),
        autoDetected: detectedCorners.length > 0,
        autoRotated: false, // Will be updated by auto-rotation logic
        enhanced: true,
        ocrData: null
      }
    };

    const editingPageId = pdfPageManager.getEditingPage();
    const editingPageIndex = editingPageId
      ? pages.findIndex(existingPage => existingPage.id === editingPageId)
      : -1;

    if (editingPageIndex >= 0) {
      const oldPage = pages[editingPageIndex];
      if (oldPage.url !== currentImageURL) URL.revokeObjectURL(oldPage.url);
      pages[editingPageIndex] = {
        ...oldPage,
        ...page,
        id: oldPage.id,
        name: oldPage.name,
        edited: true
      };
      pdfPageManager.clearEditingPage();
    } else {
      pages.push(page);
    }
    renderPages();

    // Reset optimization UI state for the saved page.
    pendingOptimized=null;
    sizeInfo.classList.remove("show");

    // If there are more files queued, open the next one automatically.
    if(fileQueue.length>0){
      setStatus("Page saved. Loading next photo…",100);
      toast("Page "+pages.length+" saved — loading next");
      const next=fileQueue.shift();
      if(next) await openForSelection(next);
    }else{
      selectionCard.style.display="none";
      if(currentImageURL){URL.revokeObjectURL(currentImageURL);currentImageURL=null;}
      currentImage=null;
      setStatus("Page saved. Add the next photo.",100);
      toast("Page "+pages.length+" saved");
      window.scrollTo({top:0,behavior:"smooth"});
    }
  }catch(e){
    console.error(e);
    toast("Could not save page.");
  }finally{
    $("saveSelection").disabled=false;
    optimizeBtn.disabled=false;
  }
};

function renderPages(){
  pagesEl.innerHTML="";
  if(!pages.length) pagesEl.appendChild(emptyEl);
  pages.forEach((p,i)=>{
    const card=document.createElement("div"); card.className="page";
    card.dataset.index=i;
    card.dataset.id=p.id;
    
    // Add source badge (Phase 6)
    const badge=document.createElement("div"); badge.className="page-badge"; badge.textContent=pdfPageManager.getSourceBadge(p.type);
    badge.title=pdfPageManager.getSourceLabel(p.type);
    
    const img=document.createElement("img"); img.src=p.url; img.alt="Page "+(i+1); img.title="Open preview";
    img.onclick=()=>openPreview(i);
    const meta=document.createElement("div"); meta.className="page-meta";
    meta.textContent=`${i+1}. ${p.name}`;
    card.addEventListener("pointerdown",e=>startPagePointerDrag(i,e));
    card.append(badge,img,meta); pagesEl.appendChild(card);
  });
  pageCountEl.textContent=pages.length+" "+(pages.length===1?"page":"pages");
  pdfBtn.disabled=pages.length===0; clearAllBtn.disabled=pages.length===0;
  exportImagesEl.disabled=pages.length!==1;
  exportImagesOption.title=pages.length===1
    ? "Download the single scanned page as a JPEG"
    : "Image download is available only for one scanned page";
  exportZipOption.style.display=pages.length>1 ? "block" : "none";
  if(pages.length!==1) exportPdfEl.checked=true;
}

function startPagePointerDrag(index,e){
  if(e.button!==undefined && e.button!==0) return;
  if(e.target.closest("button")) return;

  pagePointerDrag={index,pointerId:e.pointerId,moved:false,targetIndex:index};
  draggedPageIndex=index;
  e.preventDefault();
  pagesEl.querySelector(`[data-index="${index}"]`)?.classList.add("dragging");
}

function updatePagePointerDrag(e){
  if(!pagePointerDrag || e.pointerId!==pagePointerDrag.pointerId) return;

  const source=pagesEl.querySelector(`[data-index="${pagePointerDrag.index}"]`);
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".page");
  if(!source || !target || !pagesEl.contains(target)) return;

  pagePointerDrag.moved=true;
  const targetIndex=Number(target.dataset.index);
  pagePointerDrag.targetIndex=targetIndex;
  pagesEl.querySelectorAll(".page").forEach(page=>page.classList.remove("drag-over"));
  if(targetIndex!==pagePointerDrag.index) target.classList.add("drag-over");
}

function finishPagePointerDrag(e){
  if(!pagePointerDrag || (e && e.pointerId!==pagePointerDrag.pointerId)) return;

  const {index,targetIndex,moved}=pagePointerDrag;
  pagePointerDrag=null;
  draggedPageIndex=-1;
  pagesEl.querySelectorAll(".page").forEach(page=>page.classList.remove("dragging","drag-over"));

  if(!moved || index===targetIndex || targetIndex<0) return;
  const [movedPage]=pages.splice(index,1);
  pages.splice(targetIndex,0,movedPage);
  renderPages();
  toast("Page order updated");
}

pagesEl.addEventListener("pointermove",updatePagePointerDrag);
window.addEventListener("pointerup",finishPagePointerDrag);
window.addEventListener("pointercancel",finishPagePointerDrag);

function makeBtn(icon,title,cls){
  const b=document.createElement("button"); b.className=cls; b.title=title; b.textContent=icon; return b;
}

async function runOcr(i){
  const page=pages[i];
  if(!page) return;
  if(!window.Tesseract){
    toast("OCR is still loading.");
    return;
  }

  ocrTitle.textContent=`Text from page ${i+1}`;
  ocrStatus.textContent="Starting OCR…";
  ocrText.value="";
  ocrModal.classList.add("open");

  try{
    const result=await recognizePage(
      page,
      (message,progress)=>{
        ocrStatus.textContent=`${message} ${Math.round(progress*100)}%`;
      }
    );
    ocrText.value=result.text.trim();
    ocrStatus.textContent=ocrText.value ? "Text recognized." : "No text was found in this image.";
  }catch(e){
    console.error("OCR error:",e);
    ocrStatus.textContent="OCR failed. Check your connection and try again.";
  }
}

async function recognizePage(page,onProgress){
  if(!window.Tesseract) throw new Error("OCR is still loading.");

  const result=await Tesseract.recognize(page.url,"eng",{
    logger:message=>{
      if(message.status && typeof message.progress==="number"){
        onProgress?.(message.status,message.progress);
      }
    }
  });

  return result.data;
}

function closeOcr(){ocrModal.classList.remove("open")}
$("closeOcr").onclick=closeOcr;
$("closeOcrAction").onclick=closeOcr;
ocrModal.onclick=e=>{if(e.target===ocrModal)closeOcr()};
$("copyOcr").onclick=async()=>{
  if(!ocrText.value) return;
  try{
    await navigator.clipboard.writeText(ocrText.value);
    toast("Recognized text copied");
  }catch(e){
    ocrText.select();
    toast("Select the text to copy it");
  }
};

async function rotateStoredPage(i){
  const p=pages[i];

  const dims=rotatedDimensions(p.w,p.h,(p.rotation+90)%360);

  const im=await loadImg(p.url);

  const c=document.createElement("canvas");
  c.width=dims.w;
  c.height=dims.h;

  const ctx=c.getContext("2d");

  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,c.width,c.height);

  ctx.translate(c.width/2,c.height/2);
  ctx.rotate(Math.PI/2);

  ctx.drawImage(
    im,
    -p.w/2,
    -p.h/2,
    p.w,
    p.h
  );

  const blob=await new Promise((resolve,reject)=>{
    c.toBlob(
      b=>b
        ? resolve(b)
        : reject(new Error("Could not rotate page.")),
      "image/jpeg",
      0.82
    );
  });

  const oldUrl=p.url;
  p.blob=blob;
  p.url=URL.createObjectURL(blob);
  p.w=dims.w;
  p.h=dims.h;
  p.rotation=0;

  URL.revokeObjectURL(oldUrl);
}

async function rotatePage(i){
  try{
    await rotateStoredPage(i);
    renderPages();

    if(
      previewIndex===i &&
      previewModal.classList.contains("open")
    ){
      updatePreview();
    }
  }catch(e){
    console.error("Rotate error:",e);
    toast("Could not rotate page.");
  }
}
function deletePage(i){
  const p=pages[i]; URL.revokeObjectURL(p.url); pages.splice(i,1);
  if(previewIndex===i) closePreview();
  renderPages(); toast("Page deleted");
}

// Edit page (crop/enhance) - Phase 6
async function editPage(i){
  if(i<0 || i>=pages.length) return;
  
  const page=pages[i];
  
  // Mark this page as being edited
  pdfPageManager.setEditingPage(page.id);
  
  // Load the page image
  setStatus("Loading page for editing…",10);
  
  try{
    // Create image from page blob
    const img=new Image();
    img.src=page.url;
    
    await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=reject;
    });
    
    // Set as current image for editing
    currentImage=img;
    currentImageURL=page.url;
    selectionCard.style.display="block";
    
    // Draw to canvas
    drawSource();
    
    // Set default corners based on page dimensions
    corners=[
      {x:0, y:0},
      {x:sourceCanvas.width, y:0},
      {x:sourceCanvas.width, y:sourceCanvas.height},
      {x:0, y:sourceCanvas.height}
    ];
    
    // Initialize crop UI if not already done
    if(cropUIManager && sourceCanvas){
      cropUIManager.setCorners(corners);
      cropUIManager.render();
    }
    
    renderCorners();
    setStatus(`Editing Page ${i+1} - Adjust corners and click "Save Page" to save`,50);
    
    // Close any open modals
    closePreview();
    
  }catch(e){
    console.error("Edit page error:",e);
    toast("Could not load page for editing");
    setStatus("Edit failed",0);
  }
}

function openPreview(i){
  previewIndex=i; updatePreview(); previewModal.classList.add("open");
}
function updatePreview(){
  const p=pages[previewIndex]; if(!p)return;
  previewTitle.textContent=`Page ${previewIndex+1} of ${pages.length}`;
  previewImage.src=p.url; }
function closePreview(){previewModal.classList.remove("open");previewIndex=-1}
$("closePreview").onclick=closePreview;
previewModal.onclick=e=>{if(e.target===previewModal)closePreview()};
$("previewRotate").onclick=()=>{if(previewIndex>=0)rotatePage(previewIndex)};
$("previewDelete").onclick=()=>{if(previewIndex>=0)deletePage(previewIndex)};
$("previewEdit").onclick=()=>{if(previewIndex>=0)editPage(previewIndex)};
$("previewOcr").onclick=()=>{if(previewIndex>=0)runOcr(previewIndex)};

clearAllBtn.onclick=()=>{
  if(!pages.length)return;
  if(!confirm("Delete all scanned pages?"))return;
  pages.forEach(p=>URL.revokeObjectURL(p.url)); pages=[];
  renderPages(); toast("All pages cleared");
};

function rotatedDimensions(w,h,rotation){
  return rotation%180===0?{w,h}:{w:h,h:w};
}

function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();

    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(
      new Error("Could not read page image.")
    );

    reader.readAsDataURL(blob);
  });
}

async function makePageDataURL(p){
  return await blobToDataURL(p.blob);
}

function cleanExportName(){
  const name=exportNameEl.value.trim().replace(/\.pdf$/i,"").replace(/[\\/:*?"<>|]+/g,"-");
  return name || "government-document-scan";
}

function addSearchableText(doc,data,page,x,y,drawW,drawH){
  const words=(data?.words||[]).filter(word=>
    word.text?.trim() && word.bbox && word.confidence>0
  );

  if(!words.length) return;

  let hidden=false;
  if(
    window.jspdf.GState &&
    typeof doc.saveGraphicsState==="function" &&
    typeof doc.setGState==="function"
  ){
    doc.saveGraphicsState();
    doc.setGState(new window.jspdf.GState({opacity:0}));
    hidden=true;
  }else{
    doc.setTextColor(255,255,255);
  }

  words.forEach(word=>{
    const {x0,y0,x1,y1}=word.bbox;
    const fontSize=Math.max(
      1,
      Math.min(12,(y1-y0)/page.h*drawH*2.83465)
    );

    doc.setFontSize(fontSize);
    doc.text(
      word.text.trim(),
      x+x0/page.w*drawW,
      y+y1/page.h*drawH,
      {baseline:"bottom"}
    );
  });

  if(hidden) doc.restoreGraphicsState();
}

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function savePDF(fileName){
  if(!pages.length) return;

  pdfBtn.disabled=true;
  setStatus("Building PDF…",10);

  try{
    if(!window.jspdf || !window.jspdf.jsPDF){
      throw new Error(
        "jsPDF did not load. Check your internet connection."
      );
    }

    const {jsPDF}=window.jspdf;

    // Standard A4 pages are much more compatible with browser PDF viewers,
    // printers and government-document workflows.
    const pageW=210;
    const pageH=297;
    const margin=8;

    let doc=null;

    for(let i=0;i<pages.length;i++){
      const p=pages[i];

      setStatus(
        `Adding page ${i+1} of ${pages.length}…`,
        10+Math.round((i/pages.length)*80)
      );

      const dims=rotatedDimensions(
        p.w,
        p.h,
        p.rotation
      );

      const scale=Math.min(
        (pageW-margin*2)/dims.w,
        (pageH-margin*2)/dims.h
      );

      const drawW=dims.w*scale;
      const drawH=dims.h*scale;

      const x=(pageW-drawW)/2;
      const y=(pageH-drawH)/2;

      if(!doc){
        doc=new jsPDF({
          orientation:"portrait",
          unit:"mm",
          format:"a4",
          compress:true
        });
      }else{
        doc.addPage("a4","portrait");
      }

      const data=await makePageDataURL(p);

      doc.addImage(
        data,
        "JPEG",
        x,
        y,
        drawW,
        drawH,
        undefined,
        "FAST"
      );

      try{
        setStatus(
          `Recognizing text on page ${i+1} of ${pages.length}…`,
          90+Math.round((i/pages.length)*8)
        );
        const ocrData=await recognizePage(p,(message,progress)=>{
          if(message==="recognizing text"){
            setStatus(
              `Recognizing text on page ${i+1} of ${pages.length}…`,
              90+Math.round((i/pages.length)*8*progress)
            );
          }
        });
        addSearchableText(doc,ocrData,p,x,y,drawW,drawH);
      }catch(ocrError){
        console.warn("OCR export skipped for page",i+1,ocrError);
      }
    }

    downloadBlob(doc.output("blob"),fileName+".pdf");

    setStatus("PDF saved successfully.",100);
    toast("PDF saved");
  }catch(e){
    console.error("PDF creation error:",e);

    toast(
      "PDF creation failed: "+
      (e.message || "unknown error")
    );

    setStatus(
      "PDF creation failed. Check the browser console for details.",
      0
    );
  }finally{
    pdfBtn.disabled=pages.length===0;
  }
}

async function saveImages(fileName){
  if(pages.length!==1) return;
  setStatus("Downloading image…",60);
  downloadBlob(pages[0].blob,`${fileName}.jpg`);
}

const confirmExportButton=$("confirmExport");

function openExport(){
  if(!pages.length) return;
  exportImagesEl.disabled=pages.length!==1;
  if(pages.length!==1) exportPdfEl.checked=true;
  exportModal.classList.add("open");
  exportNameEl.focus();
  exportNameEl.select();
}
function closeExport(){exportModal.classList.remove("open")}
async function confirmExport(){
  if(exportImagesEl.checked && pages.length!==1){
    toast("Image download is available only for one scanned page.");
    return;
  }

  const fileName=cleanExportName();
  closeExport();
  confirmExportButton.disabled=true;
  try{
    if(exportImagesEl.checked) {
      await saveImages(fileName);
    } else if(exportZipEl.checked) {
      await saveImagesZip(fileName);
    } else {
      await savePDF(fileName);
    }
    setStatus("Downloads ready.",100);
    toast("Download complete");
  }finally{
    confirmExportButton.disabled=false;
  }
}

// Save multiple images as ZIP (Phase 6)
async function saveImagesZip(fileName){
  if(pages.length<2){
    toast("ZIP export requires at least 2 pages");
    return;
  }

  // Check if JSZip is available, otherwise load it
  if(!window.JSZip){
    try{
      setStatus("Loading compression library…",10);
      await new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        script.onload=resolve;
        script.onerror=reject;
        document.head.appendChild(script);
      });
    }catch(e){
      toast("Could not load ZIP library. Try PDF export instead.");
      setStatus("ZIP library load failed",0);
      return;
    }
  }

  try{
    const zip=new window.JSZip();
    const folder=zip.folder("pages");

    for(let i=0;i<pages.length;i++){
      const p=pages[i];
      setStatus(`Adding page ${i+1} to ZIP…`,Math.round((i/pages.length)*90));
      
      const pageNum=String(i+1).padStart(3,"0");
      const name=`${pageNum}-${p.name.replace(/[\\/:*?"<>|]+/g,"-")}.jpg`;
      
      folder.file(name,p.blob);
    }

    setStatus("Creating ZIP…",95);
    const blob=await folder.generateAsync({type:"blob",compression:"DEFLATE"});
    downloadBlob(blob,fileName+".zip");
    
    setStatus("ZIP created successfully",100);
  }catch(e){
    console.error("ZIP creation error:",e);
    toast("ZIP creation failed: "+e.message);
    setStatus("ZIP creation failed",0);
  }
}

pdfBtn.onclick=openExport;
$("closeExport").onclick=closeExport;
$("cancelExport").onclick=closeExport;
exportModal.onclick=e=>{if(e.target===exportModal)closeExport()};
confirmExportButton.onclick=confirmExport;

window.addEventListener("beforeunload",()=>{
  if(currentImageURL)URL.revokeObjectURL(currentImageURL);
  pages.forEach(p=>URL.revokeObjectURL(p.url));
});
