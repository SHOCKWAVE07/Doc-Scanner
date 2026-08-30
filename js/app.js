"use strict";

const $ = id => document.getElementById(id);
const cameraInput=$("cameraInput"), galleryInput=$("galleryInput");
const cameraBtn=$("cameraBtn"), galleryBtn=$("galleryBtn");
const selectionCard=$("selectionCard"), editor=$("editor"), sourceCanvas=$("sourceCanvas");
const svg=$("selectionSvg"), quadEl=$("quad"), statusEl=$("status"), progressEl=$("progress");
const pagesEl=$("pages"), emptyEl=$("empty"), pageCountEl=$("pageCount");
const pdfBtn=$("pdfBtn"), clearAllBtn=$("clearAll"), toastEl=$("toast");
const previewModal=$("previewModal"), previewImage=$("previewImage"), previewTitle=$("previewTitle");
const optimizeBtn=$("optimizeBtn"), sizeInfo=$("sizeInfo"), beforeSizeEl=$("beforeSize"), afterSizeEl=$("afterSize"), sizeSavingEl=$("sizeSaving");
const exportModal=$("exportModal"), exportNameEl=$("exportName"), exportPdfEl=$("exportPdf"), exportImagesEl=$("exportImages"), exportImagesOption=$("exportImagesOption");
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

// UI State
let selectedCompressionProfile = "balanced";

// Initialize services
let logger, qualityValidator, orientationDetector, enhancementEngine, compressionProfiles;
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
  appState = new ApplicationState();
  
  // Setup UI
  setupProfileSelector();
  setupAdjustmentSliders();
  
  cvReady=true; 
  scanner=new jscanify();
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
  
  if(qualityResult.readabilityScore >= 0.8){
    badgeText = "Excellent";
    badgeColor = "green";
  } else if(qualityResult.readabilityScore >= 0.6){
    badgeText = "Good";
    badgeColor = "blue";
  } else if(qualityResult.readabilityScore >= 0.4){
    badgeText = "Fair";
    badgeColor = "orange";
  }
  
  qualityBadge.textContent = badgeText;
  qualityBadge.style.color = badgeColor;
  
  // Update progress bars
  const blurPercent = Math.round(qualityResult.blurScore * 100);
  const readabilityPercent = Math.round(qualityResult.readabilityScore * 100);
  
  qualityBlur.style.width = blurPercent + "%";
  qualityBlurPct.textContent = blurPercent + "%";
  qualityReadability.style.width = readabilityPercent + "%";
  qualityReadabilityPct.textContent = readabilityPercent + "%";
  
  // Update message
  if(qualityResult.isAcceptable){
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
  
  // Draw original
  tempCtx.drawImage(sourceCanvas, 0, 0);
  
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

// Reset all adjustments
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

cameraBtn.onclick=()=>cameraInput.click();
galleryBtn.onclick=()=>galleryInput.click();

cameraInput.onchange=e=>handleFiles([...e.target.files]);
galleryInput.onchange=e=>handleFiles([...e.target.files]);

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

  drawSource();
  selectionCard.style.display="block";
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

function autoDetect(){
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

      renderCorners();
      setStatus(
        "4 corners detected. Drag them to the exact document corners.",
        45
      );
      
      // Detect orientation and auto-rotate if configured
      detectAndApplyOrientation(mat);
    }else{
      detectedCorners=[];
      corners=defaultCorners();

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
  if(!orientationDetector || !currentImage){
    return;
  }

  try{
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
    await autoDetect();
  }catch(e){
    logger?.error("Auto-rotation failed", {error: e.message});
    toast("Could not rotate image");
  }
}

function renderCorners(){
  if(!corners.length || !sourceCanvas.width || !sourceCanvas.height) return;

  quadEl.setAttribute(
    "points",
    corners.map(p=>`${p.x},${p.y}`).join(" ")
  );

  corners.forEach((p,i)=>{
    const el=$("c"+i);

    // Percentages are relative to the editor, which is shrink-wrapped
    // to the canvas.
    el.style.left=(p.x/sourceCanvas.width*100)+"%";
    el.style.top=(p.y/sourceCanvas.height*100)+"%";
  });
  
  // Render midpoint handles
  renderMidpoints();
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

// Update magnifier to show zoomed view at cursor position
function updateMagnifier(cursorPos){
  if(!magnifier || !magnifierCanvas || !sourceCanvas) return;
  
  const zoomLevel = 3;
  const magnifierSize = 130;
  const sourceCtx = sourceCanvas.getContext("2d");
  
  magnifierCanvas.width = magnifierSize;
  magnifierCanvas.height = magnifierSize;
  const magCtx = magnifierCanvas.getContext("2d");
  
  // Calculate source region (what to zoom into)
  const srcWidth = sourceCanvas.width / zoomLevel;
  const srcHeight = sourceCanvas.height / zoomLevel;
  const srcX = Math.max(0, Math.min(sourceCanvas.width - srcWidth, cursorPos.x - srcWidth / 2));
  const srcY = Math.max(0, Math.min(sourceCanvas.height - srcHeight, cursorPos.y - srcHeight / 2));
  
  // Draw zoomed region
  magCtx.drawImage(
    sourceCanvas,
    srcX, srcY, srcWidth, srcHeight,
    0, 0, magnifierSize, magnifierSize
  );
}

function pointerPos(ev){
  // Use the editor rectangle. The editor and canvas have exactly the
  // same displayed dimensions.
  const r=editor.getBoundingClientRect();

  const x=(ev.clientX-r.left)*(sourceCanvas.width/r.width);
  const y=(ev.clientY-r.top)*(sourceCanvas.height/r.height);

  return {
    x:Math.max(0,Math.min(sourceCanvas.width,x)),
    y:Math.max(0,Math.min(sourceCanvas.height,y))
  };
}

function startDrag(i,e){
  pendingOptimized=null;
  sizeInfo.classList.remove("show");
  e.preventDefault();
  e.stopPropagation();

  dragIndex=i;

  const el=$("c"+i);
  el.setPointerCapture?.(e.pointerId);
}

for(let i=0;i<4;i++){
  const el=$("c"+i);

  el.addEventListener("pointerdown",e=>startDrag(i,e));

  el.addEventListener("pointermove",e=>{
    if(dragIndex!==i) return;

    corners[i]=pointerPos(e);
    renderCorners();
  });

  el.addEventListener("pointerup",e=>{
    el.releasePointerCapture?.(e.pointerId);
    dragIndex=-1;
  });

  el.addEventListener("pointercancel",()=>{
    dragIndex=-1;
  });
}

// Setup midpoint event listeners for 8-point crop refinement
for(let i=0;i<4;i++){
  const el=$("m"+i);
  if(!el) continue;
  
  el.addEventListener("pointerdown",e=>{
    e.preventDefault();
    e.stopPropagation();
    draggedMidpointIndex=i;
    magnifier?.classList.add("active");
    el.setPointerCapture?.(e.pointerId);
  });

  el.addEventListener("pointermove",e=>{
    if(draggedMidpointIndex!==i) return;
    
    const pos=pointerPos(e);
    updateMagnifier(pos);
    adjustCornersFromMidpoint(i, pos);
    renderCorners();
  });

  el.addEventListener("pointerup",e=>{
    el.releasePointerCapture?.(e.pointerId);
    draggedMidpointIndex=-1;
    magnifier?.classList.remove("active");
  });

  el.addEventListener("pointercancel",()=>{
    draggedMidpointIndex=-1;
    magnifier?.classList.remove("active");
  });
}

// Adjust corner positions based on midpoint movement
function adjustCornersFromMidpoint(midpointIndex, newPos){
  if(corners.length < 4) return;
  
  // Map midpoint to adjacent corners
  const cornerPairs = [
    [0, 1], // top midpoint affects corners 0 and 1
    [1, 2], // right midpoint affects corners 1 and 2
    [2, 3], // bottom midpoint affects corners 2 and 3
    [3, 0]  // left midpoint affects corners 3 and 0
  ];
  
  const [c1, c2] = cornerPairs[midpointIndex];
  
  // Calculate offset from current midpoint to new position
  const currentMid = {
    x: (corners[c1].x + corners[c2].x) / 2,
    y: (corners[c1].y + corners[c2].y) / 2
  };
  
  const offset = {
    x: newPos.x - currentMid.x,
    y: newPos.y - currentMid.y
  };
  
  // Move both corners by the offset
  corners[c1].x += offset.x;
  corners[c1].y += offset.y;
  corners[c2].x += offset.x;
  corners[c2].y += offset.y;
  
  // Validate the new configuration
  if(!isValidQuadrilateral(corners)){
    // Undo the movement if it creates an invalid geometry
    corners[c1].x -= offset.x;
    corners[c1].y -= offset.y;
    corners[c2].x -= offset.x;
    corners[c2].y -= offset.y;
  }
}

// Validate that the quadrilateral hasn't crossed itself
function isValidQuadrilateral(pts){
  if(pts.length !== 4) return false;
  
  // Check minimum area (must be at least 10000 pixels)
  const area = Math.abs(
    (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) -
    (pts[2].x - pts[0].x) * (pts[1].y - pts[0].y)
  );
  
  if(area < 10000) return false;
  
  // Check that all points are within canvas bounds
  for(let p of pts){
    if(p.x < 0 || p.x > sourceCanvas.width || 
       p.y < 0 || p.y > sourceCanvas.height){
      return false;
    }
  }
  
  return true;
}

editor.addEventListener("pointermove",e=>{
  if(dragIndex<0 && draggedMidpointIndex<0) return;
  
  const pos = pointerPos(e);
  
  if(dragIndex >= 0){
    corners[dragIndex]=pos;
    renderCorners();
  }
  
  if(draggedMidpointIndex >= 0){
    updateMagnifier(pos);
  }
});

window.addEventListener("pointerup",()=>{
  dragIndex=-1;
  draggedMidpointIndex=-1;
  magnifier?.classList.remove("active");
});

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

    pages.push(page);
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
    const img=document.createElement("img"); img.src=p.url; img.alt="Page "+(i+1); img.title="Click to recognize text";
    img.onclick=()=>runOcr(i);
    const meta=document.createElement("div"); meta.className="page-meta";
    meta.textContent=`${i+1}. ${p.name}`;
    const actions=document.createElement("div"); actions.className="page-actions";
    const prev=makeBtn("👁","Preview","iconbtn");
    const rot=makeBtn("↻","Rotate","iconbtn");
    const ocr=makeBtn("Aa","Recognize text","iconbtn");
    const del=makeBtn("🗑","Delete","iconbtn delete");
    prev.onclick=()=>openPreview(i);
    rot.onclick=()=>rotatePage(i);
    ocr.onclick=()=>runOcr(i);
    del.onclick=()=>deletePage(i);
    actions.append(prev,rot,ocr,del);
    card.addEventListener("pointerdown",e=>startPagePointerDrag(i,e));
    card.append(img,meta,actions); pagesEl.appendChild(card);
  });
  pageCountEl.textContent=pages.length+" "+(pages.length===1?"page":"pages");
  pdfBtn.disabled=pages.length===0; clearAllBtn.disabled=pages.length===0;
  exportImagesEl.disabled=pages.length!==1;
  exportImagesOption.title=pages.length===1
    ? "Download the single scanned page as a JPEG"
    : "Image download is available only for one scanned page";
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
    if(exportImagesEl.checked) await saveImages(fileName);
    else await savePDF(fileName);
    setStatus("Downloads ready.",100);
    toast("Download complete");
  }finally{
    confirmExportButton.disabled=false;
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
