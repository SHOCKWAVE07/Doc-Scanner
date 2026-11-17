// Retain the components used by the app's LSTM-only engine without changing them.
// Format/IDs: upstream Tesseract src/ccutil/tessdatamanager.{h,cpp}.
const zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const names=['config','unicharset','unicharambigs','inttemp','pffmtable','normproto','punc-dawg',
  'word-dawg','number-dawg','freq-dawg','fixed-length-dawgs','cube-unicharset','cube-word-dawg',
  'shapetable','bigram-dawg','unambig-dawg','params-model','lstm','lstm-punc-dawg',
  'lstm-word-dawg','lstm-number-dawg','lstm-unicharset','lstm-recoder','version'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function entries(data){
  const count=data.readUInt32LE(0);
  assert.equal(count,names.length,'Unexpected traineddata format; review before compacting');
  const offsets=Array.from({length:count},(_,i)=>Number(data.readBigInt64LE(4+i*8)));
  let previous=4+count*8;
  for(const offset of offsets){
    assert.ok(offset===-1||(Number.isSafeInteger(offset)&&offset>=previous&&offset<=data.length),'Invalid OCR component offset');
    if(offset>=0)previous=offset;
  }
  return offsets.map((offset,i)=>offset===-1?null:data.subarray(offset,offsets.slice(i+1).find(n=>n>=0)??data.length));
}
module.exports=function compactOCR(compressed){
  const source=zlib.gunzipSync(compressed),parts=entries(source),keep=new Set([0,17,18,19,20,21,22,23]);
  for(const id of [17,18,19,20,21,22,23])assert.ok(parts[id]?.length,'Required LSTM component missing: '+names[id]);
  const header=Buffer.alloc(4+names.length*8,255);header.writeUInt32LE(names.length,0);
  const chunks=[header];let position=header.length;
  for(let i=0;i<parts.length;i++)if(keep.has(i)&&parts[i]){
    header.writeBigInt64LE(BigInt(position),4+i*8);chunks.push(parts[i]);position+=parts[i].length;
  }
  const compact=Buffer.concat(chunks),verified=entries(compact);
  for(let i=0;i<parts.length;i++){
    if(keep.has(i))assert.ok(parts[i]===null?verified[i]===null:parts[i].equals(verified[i]),'Active model data changed: '+names[i]);
    else assert.equal(verified[i],null,'Legacy component was not removed');
  }
  const bytes=zlib.gzipSync(compact,{level:9});
  return {bytes,report:{method:'Remove unused legacy-engine components; keep configuration, all LSTM components/dictionaries, and version unchanged',
    originalCompressedBytes:compressed.length,compactCompressedBytes:bytes.length,
    originalTrainedDataBytes:source.length,compactTrainedDataBytes:compact.length,
    originalSha256:hash(compressed),compactSha256:hash(bytes),
    retained:parts.flatMap((part,i)=>part&&keep.has(i)?[{component:names[i],bytes:part.length,sha256:hash(part)}]:[]),
    removed:parts.flatMap((part,i)=>part&&!keep.has(i)?[{component:names[i],bytes:part.length}]:[])}};
};
