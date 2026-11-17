// End-to-end checks against the local app or an explicitly supplied HTTPS deployment.
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const target=process.argv[2] ? new URL(process.argv[2]) : null;
if(target && target.protocol!=='https:')throw new Error('Live checks require HTTPS.');
const results=[], external=[], errors=[], failedResponses=[], consoleErrors=[], failedRequests=[];
const server=http.createServer((req,res)=>{
  let target;
  try{target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}
  catch{res.writeHead(400).end();return;}
  if(!target.startsWith(root+path.sep) && target!==root){res.writeHead(403).end();return;}
  if(target===root)target=path.join(root,'index.html');
  const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript',
    '.css':'text/css','.wasm':'application/wasm','.gz':'application/gzip','.png':'image/png'};
  fs.readFile(target,(error,bytes)=>{
    if(error){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream',
      'Content-Security-Policy':policy+"; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff',
      'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
    res.end(bytes);
  });
});
let browser;
async function check(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS',name);}
(async()=>{
  if(!target)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=target ? target.origin : `http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
    external.push(url);return target ? route.continue() : route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('requestfailed',request=>failedRequests.push({url:request.url(),error:request.failure()}));
  page.on('response',r=>{if(r.status()>=400)failedResponses.push(`${r.status()} ${r.url()}`);});
  page.on('dialog',dialog=>dialog.accept());
  await check('Scanner initializes with the deployed CSP and local OpenCV dependencies',async()=>{
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof cvReady!=='undefined'&&cvReady,{},{timeout:60000});
    assert.equal(await page.locator('#clearAll').isEnabled(),true);
  });
  await check('A valid image is decoded, cropped, enhanced and saved',async()=>{
    const result=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);
      ctx.fillStyle='black';ctx.font='bold 48px Arial';
      for(let i=0;i<9;i++)ctx.fillText('GOVSCAN TEST '+i,65,120+i*85);
      globalThis.testImage=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      await handleFiles([new File([testImage],'scan.png',{type:'image/png'})]);
      if(!currentImage)throw new Error('Image did not load: '+$('toast').textContent);
      await $('saveSelection').onclick();
      return {count:pages.length,status:$('status').textContent,toast:$('toast').textContent};
    });
    assert.equal(result.count,1,JSON.stringify(result));
  });
  await check('PDF export produces a downloadable PDF',async()=>{
    const downloadPromise=page.waitForEvent('download');
    await page.evaluate(()=>savePDF('security-test'));
    const download=await downloadPromise;
    const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
    const bytes=Buffer.concat(chunks);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    globalThis.exportedPDF=bytes;
  });
  await check('The patched PDF module and local worker import a real PDF',async()=>{
    const result=await page.evaluate(async bytes=>{
      await handlePdfImport([new File([new Uint8Array(bytes)],'round-trip.pdf',{type:'application/pdf'})]);
      return {count:pages.length,status:$('status').textContent,version:pdfImportHandler.pdfLib?.version};
    },Array.from(exportedPDF));
    assert.equal(result.count,2,JSON.stringify(result));assert.equal(result.version,'6.5.438');
  });
  await check('Local OCR worker, WASM core and English language data recognize text',async()=>{
    await page.evaluate(()=>runOcr(0));
    const text=await page.locator('#ocrText').inputValue();
    assert.match(text,/GOVSCAN|TEST/i,await page.locator('#ocrStatus').textContent());
  });
  await check('ZIP export loads its local dependency and downloads an archive',async()=>{
    const downloadPromise=page.waitForEvent('download');
    await page.evaluate(()=>saveImagesZip('security-test'));
    const download=await downloadPromise;
    const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).subarray(0,2).toString(),'PK');
  });
  await check('Clear Session removes editor, preview, OCR, pages and queued inputs',async()=>{
    await page.evaluate(async()=>{closeOcr();await editPage(0);openPreview(0);closePreview();ocrText.value='PRIVATE';fileQueue.push(new File([testImage],'queued.png',{type:'image/png'}));});
    await page.locator('#clearAll').click();
    const state=await page.evaluate(()=>({count:pages.length,queue:fileQueue.length,image:!!currentImage,
      url:currentImageURL,ocr:ocrText.value,preview:previewImage.getAttribute('src'),
      pixels:[...document.querySelectorAll('canvas')].reduce((n,c)=>n+c.width*c.height,0)}));
    assert.deepEqual(state,{count:0,queue:0,image:false,url:null,ocr:'',preview:null,pixels:0});
  });
  await check('A pending image decode cannot repopulate a cleared session',async()=>{
    const state=await page.evaluate(async()=>{
      const original=loadImg;let release;
      loadImg=async url=>{const image=await original(url);await new Promise(resolve=>{release=resolve;});return image;};
      const promise=handleFiles([new File([testImage],'late.png',{type:'image/png'})]);
      while(!release)await new Promise(resolve=>setTimeout(resolve,5));
      clearSensitiveState();release();await promise;loadImg=original;
      return {image:!!currentImage,count:pages.length,queue:fileQueue.length};
    });
    assert.deepEqual(state,{image:false,count:0,queue:0});
  });
  await check('Oversized image headers are rejected before image decoding',async()=>{
    const result=await page.evaluate(async()=>{
      const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);
      const v=new DataView(bytes.buffer);v.setUint32(8,13);v.setUint32(12,0x49484452);v.setUint32(16,100000);v.setUint32(20,100000);
      await handleFiles([new File([bytes],'oversized.png',{type:'image/png'})]);
      return {image:!!currentImage,message:$('toast').textContent};
    });
    assert.equal(result.image,false);assert.match(result.message,/limit/);
  });
  await check('Late OCR completion cannot restore cleared sensitive text',async()=>{
    const result=await page.evaluate(async()=>{
      await handleFiles([new File([testImage],'ocr-cancel.png',{type:'image/png'})]);
      await $('saveSelection').onclick();
      const original=Tesseract.createWorker;let complete,terminated=0;
      Tesseract.createWorker=async()=>({recognize:()=>new Promise(resolve=>{complete=resolve;}),terminate:async()=>{terminated++;}});
      const pending=runOcr(0);
      while(!complete)await new Promise(resolve=>setTimeout(resolve,5));
      clearSensitiveState();complete({data:{text:'MUST NOT RETURN'}});await pending;
      await new Promise(resolve=>setTimeout(resolve,0));Tesseract.createWorker=original;
      return {text:ocrText.value,pages:pages.length,terminated};
    });
    assert.deepEqual(result,{text:'',pages:0,terminated:1});
  });
  await check('Late page processing cannot restore pages after Clear Session',async()=>{
    const result=await page.evaluate(async()=>{
      await handleFiles([new File([testImage],'save-cancel.png',{type:'image/png'})]);
      const original=buildScanVariants;let complete;
      buildScanVariants=()=>new Promise(resolve=>{complete=resolve;});
      const pending=$('saveSelection').onclick();
      clearSensitiveState();complete({optimizedBlob:testImage,rawBlob:testImage,width:800,height:1000});
      await pending;buildScanVariants=original;
      return {pages:pages.length,image:!!currentImage,preview:previewImage.getAttribute('src')};
    });
    assert.deepEqual(result,{pages:0,image:false,preview:null});
  });
  await check('Late editor rotation cannot restore cleared pixels',async()=>{
    const result=await page.evaluate(async()=>{
      await handleFiles([new File([testImage],'rotation-cancel.png',{type:'image/png'})]);
      const original=loadImg;let release;
      loadImg=async url=>{const image=await original(url);await new Promise(resolve=>{release=resolve;});return image;};
      const pending=rotateSelectionBtn.onclick();
      while(!release)await new Promise(resolve=>setTimeout(resolve,5));
      clearSensitiveState();release();await pending;loadImg=original;
      return {image:!!currentImage,pixels:sourceCanvas.width*sourceCanvas.height};
    });
    assert.deepEqual(result,{image:false,pixels:0});
  });
  await check('No external runtime requests, missing assets, or unhandled browser errors',()=>{
    assert.deepEqual(external,[]);assert.deepEqual(failedResponses,[]);assert.deepEqual(errors,[]);
  });
  await check('Untrusted filenames and OCR text render as text without DOM execution',async()=>{
    const result=await page.evaluate(async()=>{
      globalThis.__vaptDomMarker=0;
      const payload='<img src=x onerror="globalThis.__vaptDomMarker=1">';
      await handleFiles([new File([testImage],payload+'.png',{type:'image/png'})]);
      await $('saveSelection').onclick();
      const filenameSafe=$('pages').textContent.includes(payload)&&!document.querySelector('img[src="x"]');
      const original=Tesseract.createWorker;
      Tesseract.createWorker=async()=>({recognize:async()=>({data:{text:'</textarea>'+payload}}),terminate:async()=>{}});
      await runOcr(0);Tesseract.createWorker=original;
      const textSafe=ocrText.value==='</textarea>'+payload&&!document.querySelector('img[src="x"]');
      const marker=globalThis.__vaptDomMarker;clearSensitiveState();
      return {filenameSafe,textSafe,marker};
    });
    assert.deepEqual(result,{filenameSafe:true,textSafe:true,marker:0});
  });
  await check('Spoofed SVG input and oversized PDFs are refused before rendering',async()=>{
    const result=await page.evaluate(async()=>{
      let imageRejected=false,pdfRejected=false,read=false;
      try{await validateImageFile(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],'spoof.png',{type:'image/png'}));}
      catch{imageRejected=true;}
      try{await pdfImportHandler.importPDF({name:'oversized.pdf',type:'application/pdf',size:1024**3,arrayBuffer:async()=>{read=true;return new ArrayBuffer(1);}});}
      catch{pdfRejected=true;}
      return {imageRejected,pdfRejected,read};
    });
    assert.deepEqual(result,{imageRejected:true,pdfRejected:true,read:false});
  });
})().catch(error=>{console.error(error);console.error({external,failedResponses,errors,consoleErrors,failedRequests});process.exitCode=1;})
  .finally(async()=>{
    // Include events from every test, including checks added after the network check.
    if(external.length||failedResponses.length||errors.length)process.exitCode=1;
    fs.writeFileSync(path.join(__dirname,target?'live-browser-results.json':'browser-results.json'),JSON.stringify({
      checkedAtUtc:new Date().toISOString(),target:target?.href||'loopback test server',browser:browser?await browser.version():null,
      result:process.exitCode?'FAIL':'PASS',results,external,failedResponses,errors,
      consoleErrors:consoleErrors.map(message=>message.slice(0,1000)),failedRequests,
      method:target?'Live HTTPS page; synthetic documents; no server mutations; delayed browser callbacks mocked for cancellation checks':'Local end-to-end checks',
    },null,2)+'\n');
    await browser?.close();if(server.listening)server.close();
  });
