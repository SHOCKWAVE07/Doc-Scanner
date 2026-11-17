// Targeted follow-up for deployment drift found by the read-only asset audit.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const base=new URL('https://docscannerme.netlify.app/');
const root=path.resolve(__dirname,'..');
const evidence={checkedAtUtc:new Date().toISOString(),target:base.href,comparisons:[]};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normalize=text=>text.replace(/\r\n/g,'\n');
(async()=>{
  for(const resource of ['/','/vendor/jscanify-1.4.3/src/jscanify.js','/vendor/jscanify-1.4.3/LICENSE']){
    const response=await fetch(new URL(resource,base),{signal:AbortSignal.timeout(20000)});
    const live=Buffer.from(await response.arrayBuffer());
    const local=fs.readFileSync(path.join(root,resource==='/'?'index.html':resource.slice(1)));
    const a=normalize(local.toString('utf8')),b=normalize(live.toString('utf8'));
    const linesA=a.split('\n'),linesB=b.split('\n'),differences=[];
    for(let i=0;i<Math.max(linesA.length,linesB.length)&&differences.length<12;i++)
      if(linesA[i]!==linesB[i])differences.push({line:i+1,local:linesA[i]?.slice(0,250),live:linesB[i]?.slice(0,250)});
    evidence.comparisons.push({path:resource,status:response.status,localSha256:sha(local),liveSha256:sha(live),
      localBytes:local.length,liveBytes:live.length,equalAfterNewlineNormalization:a===b,
      equalIgnoringHtmlComments:resource==='/' ?
        a.replace(/<!--[\s\S]*?-->/g,'').replace(/>\s+</g,'><').trim()===b.replace(/<!--[\s\S]*?-->/g,'').replace(/>\s+</g,'><').trim() : undefined,
      localCRLF:(local.toString().match(/\r\n/g)||[]).length,liveCRLF:(live.toString().match(/\r\n/g)||[]).length,differences});
  }
  // Only published report content is checked; no credential files are downloaded here.
  const response=await fetch(new URL('/VAPT_REPORT.md',base),{signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  evidence.exposedReport={status:response.status,confidentialMarking:text.includes('Confidential'),
    containsVulnerabilityDetails:text.includes('CVE-2024-4367'),containsRemediationLink:text.includes('security/REMEDIATION.md')};
  console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{evidence.error=error.message;console.error(error);process.exitCode=1;})
  .finally(()=>fs.writeFileSync(path.join(__dirname,'live-followup-results.json'),JSON.stringify(evidence,null,2)+'\n'));
