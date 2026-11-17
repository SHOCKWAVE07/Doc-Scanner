// Regression checks: real policy/handler code, mocked parser and canvas APIs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const results = [];
async function check(name, fn) { await fn(); results.push({ name, result: 'PASS' }); }
function pdfContext({ width=100, height=100, count=1, failAt=0, pending=false, nullBlob=false }={}) {
  const state = { options:[], canvases:[], urls:[], revoked:[], reads:0, renders:0, destroyed:0, cleaned:0 };
  let rejectLoading;
  const pdf = { numPages:count, async getPage(i) {
    if (i===failAt) throw new Error('controlled render failure');
    return { getViewport() { return { width,height }; }, cleanup() { state.cleaned++; },
      render() { state.renders++; return { promise:Promise.resolve() }; } };
  } };
  const lib = { getDocument(options) {
    state.options.push(options);
    return { promise:pending ? new Promise((_,reject)=>{rejectLoading=reject;}) : Promise.resolve(pdf),
      async destroy() { state.destroyed++; rejectLoading?.(new Error('cancelled')); } };
  } };
  class MockURL extends URL {
    static createObjectURL() { const url=`blob:mock-${state.urls.length}`; state.urls.push(url); return url; }
    static revokeObjectURL(url) { state.revoked.push(url); }
  }
  const context=vm.createContext({ console, AbortController, TextDecoder, Uint8Array, URL:MockURL, setTimeout, clearTimeout,
    document:{ baseURI:'http://localhost/', createElement(tag) {
      assert.equal(tag,'canvas');
      const c={ getContext() {return {};}, toBlob(cb) {cb(nullBlob ? null : {size:1});} };
      state.canvases.push(c); return c;
    } } });
  vm.runInContext(read('js/services/security-policy.js')+'\n'+read('js/services/pdf-import-handler.js')+
    '\nglobalThis.handler = new PDFImportHandler();',context);
  context.handler.pdfLib=lib;
  const file={name:'synthetic.pdf',type:'application/pdf',size:100,
    async arrayBuffer() {state.reads++;return Uint8Array.from(Buffer.from('%PDF-1.7\n')).buffer;} };
  return {state,context,file};
}
function png(width,height) {
  const b=Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(b);
  b.writeUInt32BE(13,8); b.write('IHDR',12); b.writeUInt32BE(width,16); b.writeUInt32BE(height,20);
  return new Blob([b],{type:'image/png'});
}
(async()=>{
  await check('Both PDF entry points disable evaluation/scripting, render valid input, and destroy parser resources',async()=>{
    const {state,context,file}=pdfContext();
    const pages=await context.handler.importPDF(file);
    const canvas=await context.handler.renderPageToCanvas(file,0);
    assert.equal(pages.length,1); assert.equal(canvas.width,100);
    assert.equal(state.destroyed,2);
    for(const options of state.options) {
      assert.equal(options.isEvalSupported,false); assert.equal(options.enableScripting,false);
      assert.equal(options.enableXfa,false); assert.ok(options.maxImageSize>0);
      for(const key of ['cMapUrl','standardFontDataUrl','wasmUrl','iccUrl']) assert.equal(new URL(options[key]).origin,'http://localhost');
    }
  });
  await check('Oversize PDFs are rejected before reading',async()=>{
    const {state,context,file}=pdfContext(); file.size=1024**3;
    await assert.rejects(()=>context.handler.importPDF(file),/25 MiB/);
    await assert.rejects(()=>context.handler.renderPageToCanvas(file,0),/25 MiB/);
    assert.equal(state.reads,0);
  });
  await check('Non-PDF contents are rejected before parser invocation',async()=>{
    const {state,context,file}=pdfContext(); file.arrayBuffer=async()=>new Uint8Array(20).buffer;
    await assert.rejects(()=>context.handler.importPDF(file),/not a PDF/); assert.equal(state.options.length,0);
  });
  await check('Excess page counts and dimensions are rejected before canvas allocation',async()=>{
    for(const settings of [{count:1000},{width:100000,height:100000},{width:NaN}]) {
      const {state,context,file}=pdfContext(settings);
      await assert.rejects(()=>context.handler.importPDF(file),/limit/);
      assert.equal(state.canvases.length,0); assert.equal(state.destroyed,1);
    }
  });
  await check('Failed import releases partial URLs, canvases, and parser resources',async()=>{
    const {state,context,file}=pdfContext({count:3,failAt:2});
    await assert.rejects(()=>context.handler.importPDF(file),/controlled render failure/);
    assert.deepEqual(state.revoked,state.urls); assert.equal(state.urls.length,1);
    assert.equal(state.destroyed,1); assert.equal(state.canvases[0].width,0);
  });
  await check('Total rendering and output-byte budgets are enforced with rollback',async()=>{
    const large=pdfContext({width:4000,height:4000,count:8});
    await assert.rejects(()=>large.context.handler.importPDF(large.file),/total rendering budget/);
    assert.deepEqual(large.state.revoked,large.state.urls);
    const small=pdfContext({count:3});
    await assert.rejects(()=>small.context.handler.importPDF(small.file,null,{maxBytes:1}),/memory budget/);
    assert.deepEqual(small.state.revoked,small.state.urls);
  });
  await check('Null canvas encoding fails safely and releases resources',async()=>{
    const {state,context,file}=pdfContext({nullBlob:true});
    await assert.rejects(()=>context.handler.importPDF(file),/encode/); assert.equal(state.destroyed,1);
    assert.equal(state.canvases[0].width,0);
  });
  await check('Cancellation destroys an active parser and concurrent imports are refused',async()=>{
    const {state,context,file}=pdfContext({pending:true});
    const promise=context.handler.importPDF(file);
    while(!state.options.length) await new Promise(resolve=>setImmediate(resolve));
    await assert.rejects(()=>context.handler.importPDF(file),/Another PDF/);
    const rejected=assert.rejects(()=>promise,/cancelled/);
    context.handler.cancel(); await rejected;
    assert.equal(state.destroyed,1); assert.equal(context.handler.active,null);
  });
  await check('Pre-aborted imports do not read input',async()=>{
    const {state,context,file}=pdfContext(); const c=new AbortController(); c.abort();
    await assert.rejects(()=>context.handler.importPDF(file,null,{signal:c.signal}),/cancelled/);
    assert.equal(state.reads,0);
  });
  await check('Late camera permission and metadata cannot restore a stopped session',async()=>{
    let allow,stopped=0;
    const c=vm.createContext({console:{error(){}},setTimeout,clearTimeout,cancelAnimationFrame(){},
      navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{allow=resolve;})}}});
    vm.runInContext(read('js/services/camera-stream-manager.js')+'\nglobalThis.manager=new CameraStreamManager({imageProcessing:{}});',c);
    const video={srcObject:null,play:async()=>{},videoWidth:800,videoHeight:600},canvas={width:0,height:0};
    const pending=c.manager.initialize(video,canvas,null);
    const rejected=assert.rejects(()=>pending,/cancelled/);
    c.manager.stop();allow({getTracks:()=>[{stop(){stopped++;}}]});await rejected;
    assert.equal(stopped,1);assert.equal(video.srcObject,null);
    const second=c.manager.initialize(video,canvas,null);
    allow({getTracks:()=>[{stop(){stopped++;}}]});
    await new Promise(resolve=>setImmediate(resolve));
    const lateMetadata=video.onloadedmetadata;
    const secondRejected=assert.rejects(()=>second,/cancelled/);
    c.manager.stop();lateMetadata();await secondRejected;
    assert.equal(canvas.width,0);assert.equal(stopped,2);
  });
  await check('Image signature/dimension validation accepts bounded PNG and rejects oversized or spoofed images',async()=>{
    const c=vm.createContext({Uint8Array,DataView}); vm.runInContext(read('js/services/security-policy.js'),c);
    assert.equal((await c.validateImageFile(png(800,600))).width,800);
    await assert.rejects(()=>c.validateImageFile(png(100000,100000)),/limit/);
    await assert.rejects(()=>c.validateImageFile(new Blob(['<svg/>'],{type:'image/png'})),/valid JPEG/);
    const oversized={size:1024**3,slice(){throw new Error('Must not read');}};
    await assert.rejects(()=>c.validateImageFile(oversized),/25 MiB/);
  });
  await check('All vendored asset hashes match the reviewed inventory',()=>{
    const inventory=JSON.parse(read('vendor/manifest.json').replace(/^\uFEFF/,''));
    assert.ok(inventory.assets.length>100);
    for(const asset of inventory.assets) {
      const bytes=fs.readFileSync(path.join(root,'vendor',asset.path));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.path);
    }
    assert.ok(fs.existsSync(path.join(root,'vendor/opencv-4.7.0/LICENSE')));
    assert.ok(fs.existsSync(path.join(root,'vendor/tessdata/LICENSE')));
  });
  await check('Executable entry points use local assets and CSP restricts network origins',()=>{
    const html=read('index.html');
    for(const match of html.matchAll(/<script\b[^>]*src="([^"]+)"/g)) {
      assert.ok(!match[1].includes('://')); assert.ok(fs.existsSync(path.join(root,match[1])));
    }
    assert.doesNotMatch(read('js/app.js'),/script.src\s*=\s*["']https:/);
    assert.doesNotMatch(read('js/services/pdf-import-handler.js'),/https:\/\//);
    assert.match(html,/connect-src 'self'/); assert.match(html,/object-src 'none'/);
  });
  const files=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}
  walk(path.join(root,'js'));
  for(const file of files) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
  results.push({name:`JavaScript syntax (${files.length} application files)`,result:'PASS'});
  console.log(JSON.stringify({scope:'Remediation regressions; mocked PDF parser and browser APIs',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
