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

let cvReady=false, scanner=null, currentImage=null, currentImageURL=null;
let fileQueue=[];
let corners=[], detectedCorners=[], currentFileName="", dragIndex=-1;
let pages=[], previewIndex=-1;
let pendingOptimized=null;
let draggedPageIndex=-1;
let pagePointerDrag=null;

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
  cvReady=true; scanner=new jscanify();
  setStatus("Ready. Take a photo or add multiple photos.",0);
}).catch(e=>setStatus(e.message,0));

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

editor.addEventListener("pointermove",e=>{
  if(dragIndex<0) return;

  corners[dragIndex]=pointerPos(e);
  renderCorners();
});

window.addEventListener("pointerup",()=>{
  dragIndex=-1;
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
  // Keep the original color information, but improve local contrast and
  // text sharpness. This is intentionally moderate so stamps, signatures
  // and colored government forms are not destroyed.

  const denoised=new cv.Mat();
  const blurred=new cv.Mat();
  const sharpened=new cv.Mat();

  try{
    cv.GaussianBlur(
      out,
      denoised,
      new cv.Size(3,3),
      0
    );

    // Unsharp masking: original + a small amount of high-frequency detail.
    cv.addWeighted(
      out,
      1.45,
      denoised,
      -0.45,
      0,
      sharpened
    );

    return sharpened.clone();
  }finally{
    denoised.delete();
    blurred.delete();
    sharpened.delete();
  }
}

function formatBytes(bytes){
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

async function buildScanVariants(){
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
      const MAX_OUTPUT_SIDE=1800;
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

        const optimizedCanvas=document.createElement("canvas");
        optimizedCanvas.width=finalW;
        optimizedCanvas.height=finalH;
        cv.imshow(optimizedCanvas,resized);

        const optimizedBlob=await canvasToBlob(optimizedCanvas,0.78);

        return {
          rawBlob,
          optimizedBlob,
          width:finalW,
          height:finalH,
          rawWidth:w,
          rawHeight:h
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
    const result=await buildScanVariants();
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
    setStatus("Optimization complete. Review the size, then save the page.",90);
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

    pages.push({
      id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
      blob,
      url,
      w:result.width,
      h:result.height,
      rotation:0,
      name:currentFileName||("page-"+(pages.length+1)),
      originalSize:result.rawBlob.size,
      compressedSize:result.optimizedBlob.size
    });

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
    const result=await Tesseract.recognize(page.url,"eng",{
      logger:message=>{
        if(message.status && typeof message.progress==="number"){
          ocrStatus.textContent=`${message.status} ${Math.round(message.progress*100)}%`;
        }
      }
    });
    ocrText.value=result.data.text.trim();
    ocrStatus.textContent=ocrText.value ? "Text recognized." : "No text was found in this image.";
  }catch(e){
    console.error("OCR error:",e);
    ocrStatus.textContent="OCR failed. Check your connection and try again.";
  }
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
