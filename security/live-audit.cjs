// Read-only, bounded HTTP audit. No exploit files, uploads, or stress requests.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const base=new URL(process.argv[2]||'https://docscannerme.netlify.app/');
if(base.protocol!=='https:')throw new Error('HTTPS target required.');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const evidence={checkedAtUtc:new Date().toISOString(),target:base.origin,method:'Read-only GETs; asset verification with at most four simultaneous requests; no attack payloads',
  checks:[],responses:[],assets:[],publicDevelopmentFiles:[]};
async function get(resource,{redirect='follow',max=12*1024*1024}={}){
  const url=new URL(resource,base);
  if(url.hostname!==base.hostname)throw new Error('Cross-host request refused.');
  const response=await fetch(url,{redirect,signal:AbortSignal.timeout(30000),headers:{'User-Agent':'GovScan-Authorized-VAPT-Recheck/1.0'}});
  const chunks=[];let size=0;
  if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>max)throw new Error('Response exceeds audit byte budget.');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  return {url:url.href,finalUrl:response.url,status:response.status,headers:Object.fromEntries(response.headers),bytes};
}
function record(name,passed,detail){evidence.checks.push({name,result:passed?'PASS':'REVIEW',detail});}
(async()=>{
  const home=await get('/');
  evidence.responses.push({...home,bytes:undefined,sha256:digest(home.bytes)});
  record('HTTPS page loads with valid certificate validation',home.status===200,{status:home.status});
  const redirect=await get('http://'+base.host+'/',{redirect:'manual',max:1024*1024});
  evidence.responses.push({...redirect,bytes:undefined});
  record('HTTP redirects to HTTPS',[301,302,307,308].includes(redirect.status)&&redirect.headers.location?.startsWith('https://'+base.host),{status:redirect.status,location:redirect.headers.location});
  const h=home.headers;
  for(const name of ['content-security-policy','strict-transport-security','x-content-type-options','referrer-policy','permissions-policy','x-frame-options'])
    record('Response header: '+name,!!h[name],h[name]||null);
  record('HTML is not cached for reuse',/no-store/i.test(h['cache-control']||''),h['cache-control']);
  record('Framing is denied',h['x-frame-options']==='DENY'&&/frame-ancestors 'none'/.test(h['content-security-policy']||''));
  evidence.cspCompatibilityAllowances={unsafeEval:/script-src[^;]*'unsafe-eval'/.test(h['content-security-policy']||''),inlineStyles:/style-src[^;]*'unsafe-inline'/.test(h['content-security-policy']||'')};
  const html=home.bytes.toString('utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]);
  record('No third-party script tags',scripts.every(src=>new URL(src,base).origin===base.origin),scripts);
  const normalize=text=>text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  record('Deployed HTML matches workspace source',normalize(html)===normalize(fs.readFileSync(path.join(root,'index.html'),'utf8')));
  for(const resource of ['/js/app.js','/js/services/pdf-import-handler.js','/js/services/security-policy.js']){
    const response=await get(resource);const local=fs.readFileSync(path.join(root,resource.slice(1)),'utf8');
    evidence.responses.push({...response,bytes:undefined,sha256:digest(response.bytes)});
    record('Deployed source matches workspace: '+resource,response.status===200&&normalize(response.bytes.toString())===normalize(local));
  }
  const manifestResponse=await get('/vendor/manifest.json');
  const actual=JSON.parse(manifestResponse.bytes.toString('utf8').replace(/^\uFEFF/,''));
  const expected=JSON.parse(fs.readFileSync(path.join(root,'vendor/manifest.json'),'utf8').replace(/^\uFEFF/,''));
  const actualMap=new Map(actual.assets.map(a=>[a.path,a.sha256]));
  record('Live inventory matches reviewed asset digests',actualMap.size===expected.assets.length&&expected.assets.every(a=>actualMap.get(a.path)===a.sha256),{assets:actualMap.size});
  evidence.packages=actual.packages;
  // Validate against the local inventory, not against an untrusted remote hash alone.
  let index=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(index<expected.assets.length){
      const asset=expected.assets[index++];
      if(!/^[a-zA-Z0-9_.\-/]+$/.test(asset.path)||asset.path.split('/').includes('..'))throw new Error('Invalid inventory path.');
      const response=await get('/vendor/'+asset.path);
      const hash=digest(response.bytes);
      evidence.assets.push({path:asset.path,status:response.status,bytes:response.bytes.length,contentType:response.headers['content-type'],contentEncoding:response.headers['content-encoding']||null,
        sha256:hash,expectedSha256:asset.sha256,match:response.status===200&&hash===asset.sha256});
      if(evidence.assets.length%50===0)console.log('Verified',evidence.assets.length,'assets');
    }
  }));
  record('All deployed assets match reviewed bytes',evidence.assets.every(a=>a.match),{count:evidence.assets.length,mismatches:evidence.assets.filter(a=>!a.match).map(a=>a.path)});
  const modules=evidence.assets.filter(a=>a.path.endsWith('.mjs'));
  record('PDF module MIME types support nosniff',modules.every(a=>/javascript/i.test(a.contentType)),modules.map(a=>({path:a.path,contentType:a.contentType})));
  const model=evidence.assets.find(a=>a.path==='tessdata/eng.traineddata.gz');
  record('OCR model is delivered as an intact gzip file',model?.match&&!model.contentEncoding,model?{contentType:model.contentType,contentEncoding:model.contentEncoding}:null);
  // Small allowlist to check accidental publishing; do not store credential bodies.
  for(const resource of ['/package.json','/security/vapt-checks.cjs','/VAPT_REPORT.md','/.git/HEAD','/.env']){
    const response=await get(resource,{max:1024*1024});
    const body=response.bytes.toString('utf8');
    const htmlFallback=/^\s*<!doctype html|^\s*<html/i.test(body);
    const exposed=response.status===200&&!htmlFallback&&body.trim().length>0;
    evidence.publicDevelopmentFiles.push({path:resource,status:response.status,contentType:response.headers['content-type'],exposed,htmlFallback});
  }
  record('Development and sensitive files are not published',evidence.publicDevelopmentFiles.every(a=>!a.exposed),evidence.publicDevelopmentFiles);
  evidence.assetBytes=evidence.assets.reduce((n,a)=>n+a.bytes,0);
  evidence.result=evidence.checks.every(c=>c.result==='PASS')?'PASS':'REVIEW';
  console.log(JSON.stringify({result:evidence.result,checks:evidence.checks,assetBytes:evidence.assetBytes},null,2));
})().catch(error=>{evidence.error=error.message;evidence.result='INCOMPLETE';console.error(error);process.exitCode=1;})
  .finally(()=>{fs.writeFileSync(path.join(__dirname,'live-audit-results.json'),JSON.stringify(evidence,null,2)+'\n');});
