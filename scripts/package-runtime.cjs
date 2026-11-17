// Build a byte-preserving, dependency-free static deployment package.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const JSZip=require('../vendor/jszip-3.10.1/dist/jszip.min.js');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'dist');
const compact=process.argv.includes('--compact');
const staging=path.join(output,compact?'runtime-compact':'runtime');
const zipPath=path.join(output,compact?'Doc-Scanner-compact.zip':'Doc-Scanner-runtime.zip');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=relative=>fs.readFileSync(path.join(root,relative));
const inventory=JSON.parse(read('vendor/manifest.json').toString('utf8').replace(/^\uFEFF/,''));
const files=new Map();
function add(relative){
  assert.ok(!relative.split('/').includes('..'));
  files.set(relative,read(relative));
}
for(const relative of ['index.html','styles.css','LICENSE','_headers'])add(relative);
function walk(directory){
  for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})){
    const relative=directory+'/'+entry.name;
    if(entry.isDirectory())walk(relative);
    else if(entry.name.endsWith('.js'))add(relative);
  }
}
walk('js');
// The distributed OCR .wasm.js loaders embed these same WASM binaries as data URLs.
// Keep both SIMD and non-SIMD embedded loaders for portability; omit the duplicates.
const omitted=new Set([
  'README.md',
  'tesseract.js-core-5.1.1/tesseract-core-lstm.wasm',
  'tesseract.js-core-5.1.1/tesseract-core-simd-lstm.wasm',
]);
for(const asset of inventory.assets){
  const bytes=read('vendor/'+asset.path);
  assert.equal(hash(bytes),asset.sha256,'Vendor digest mismatch: '+asset.path);
  if(!omitted.has(asset.path))files.set('vendor/'+asset.path,bytes);
}
for(const name of ['tesseract-core-lstm','tesseract-core-simd-lstm']){
  const loader=read('vendor/tesseract.js-core-5.1.1/'+name+'.wasm.js').toString();
  assert.ok(loader.includes('data:application/octet-stream;base64,'),'OCR loader must embed its WASM binary');
  assert.ok(!loader.includes(name+'.wasm"')&&!loader.includes(name+".wasm'"),'OCR loader unexpectedly references external WASM');
}
// Describe precisely the bytes in this artifact, rather than shipping stale digests.
let ocrCompaction=null;
if(compact){
  assert.match(read('js/app.js').toString(),/Tesseract\.createWorker\('eng',1,/);
  const result=require('./compact-ocr-model.cjs')(files.get('vendor/tessdata/eng.traineddata.gz'));
  files.set('vendor/tessdata/eng.traineddata.gz',result.bytes);ocrCompaction=result.report;
  files.set('vendor/tessdata/COMPACT-NOTICE.txt',Buffer.from(
    'Modified OCR archive: unused legacy-engine components removed during packaging.\n'+
    'Original configuration, LSTM recognition model, LSTM dictionaries, character\n'+
    'set, recoder, and version are retained byte-for-byte. The application uses\n'+
    'LSTM_ONLY (engine mode 1); legacy OCR engine mode is not supported by this build.\n'+
    'Source: https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz\n'+
    'License: Apache-2.0; see the adjacent LICENSE.\n'));
}
const shippedAssets=[...files].filter(([name])=>name.startsWith('vendor/')).map(([name,bytes])=>({path:name.slice(7),sha256:hash(bytes)}));
files.set('vendor/manifest.json',Buffer.from(JSON.stringify({packages:inventory.packages,assets:shippedAssets,
  ...(ocrCompaction?{transformations:{englishOCR:ocrCompaction}}:{})},null,2)+'\n'));
files.set('DEPLOYMENT.txt',Buffer.from(`GovScan / Doc-Scanner - portable static runtime

Extract this ZIP, then serve its contents from a static HTTP(S) web server.
Keep index.html at the site's document root. No npm install, Node.js runtime,
backend, database, or external CDN is required by the application.
Use HTTPS in production; localhost also permits camera access for local tests.
Opening index.html directly with file:// does not support all scanner features.

Netlify: deploy this ZIP or its extracted contents. The included _headers file
sets the security response headers. Do not deploy the source repository root.
Other hosts: translate _headers into your server's response-header settings.
Serve .js/.mjs as JavaScript and .wasm as application/wasm. Serve the English
OCR model .traineddata.gz as a gzip file, without HTTP Content-Encoding: gzip;
the OCR runtime decompresses the model itself.

Keep the vendor directory intact. Offline dependencies include OpenCV, PDF.js,
OCR worker/cores, English language data, and PDF rendering/font assets.
Licenses and a byte-accurate vendor/manifest.json are included.
${compact?'Compact edition: unused legacy OCR data is omitted. The active LSTM model\nand its dictionaries are unchanged; see vendor/tessdata/COMPACT-NOTICE.txt.\n':''}
Both SIMD and non-SIMD OCR loaders are required for different browsers/devices;
their embedded WASM replaces redundant standalone OCR .wasm copies.

For local testing, use any existing static server bound to localhost.
If Python is already installed: python -m http.server 8080 --bind 127.0.0.1
Then open http://localhost:8080/ .
`, 'utf8'));
for(const name of files.keys()){
  assert.ok(!/(^|\/)(node_modules|security|\.git|scripts)(\/|$)/.test(name)&&!name.startsWith('dist/'),'Non-runtime path: '+name);
  assert.ok(!/^package(-lock)?\.json$|VAPT|\.tgz$|\.map$/i.test(name),'Unnecessary artifact: '+name);
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  // Never delete or overwrite unrelated output directories.
  if(fs.existsSync(staging)){
    const existing=[];
    function list(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())list(p);else existing.push(path.relative(staging,p).split(path.sep).join('/'));}}
    list(staging);
    for(const name of existing)assert.ok(files.has(name),'Unexpected existing runtime file; inspect before packaging: '+name);
  }
  const zip=new JSZip();
  for(const [relative,bytes] of [...files].sort(([a],[b])=>a.localeCompare(b))){
    const destination=path.join(staging,...relative.split('/'));
    fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
    zip.file(relative,bytes,{date:new Date('2026-01-01T00:00:00Z'),createFolders:false,unixPermissions:0o644});
  }
  const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9},platform:'UNIX'});
  fs.writeFileSync(zipPath,bytes);
  // Read the finished ZIP and verify every entry against the exact packaged bytes.
  const archive=await JSZip.loadAsync(bytes,{checkCRC32:true});
  assert.equal(Object.keys(archive.files).length,files.size);
  for(const [name,expected] of files)assert.equal(hash(await archive.file(name).async('nodebuffer')),hash(expected),name);
  const uncompressed=[...files.values()].reduce((sum,b)=>sum+b.length,0);
  const report={archive:path.relative(root,zipPath).split(path.sep).join('/'),files:files.size,ocrCompaction,
    uncompressedBytes:uncompressed,zipBytes:bytes.length,zipMiB:Number((bytes.length/1024**2).toFixed(2)),
    sha256:hash(bytes),omittedVendorFiles:[...omitted],
    excluded:['node_modules','development package files','reports and security tests','Git metadata','download caches','source maps','duplicate standalone OCR WASM'],
    verification:'Every ZIP entry CRC and SHA-256 verified; all source vendor digests verified',
    entries:[...files].map(([name,b])=>({path:name,bytes:b.length,sha256:hash(b)}))};
  fs.writeFileSync(path.join(output,compact?'package-compact-report.json':'package-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({archive:report.archive,files:report.files,uncompressedBytes:uncompressed,zipMiB:report.zipMiB,sha256:report.sha256},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
