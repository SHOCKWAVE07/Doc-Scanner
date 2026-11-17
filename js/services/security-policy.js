/* Shared limits for untrusted files. Validate dimensions before decoding. */
const SECURITY_LIMITS = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024, maxSessionBytes: 100 * 1024 * 1024,
  maxPages: 100, maxPixels: 16 * 1024 * 1024, maxDimension: 16384,
  maxImportPixels: 100 * 1024 * 1024, operationTimeout: 60000,
});
function validateFileSize(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > SECURITY_LIMITS.maxFileBytes) {
    throw new Error('Choose a non-empty file no larger than 25 MiB.');
  }
}
function validateDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
      width > SECURITY_LIMITS.maxDimension || height > SECURITY_LIMITS.maxDimension ||
      Math.ceil(width) * Math.ceil(height) > SECURITY_LIMITS.maxPixels) {
    throw new Error('Image or PDF page exceeds the 16 megapixel rendering limit.');
  }
}
async function validateImageFile(file) {
  validateFileSize(file);
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  let width, height;
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b) &&
      view.getUint32(12) === 0x49484452 && view.getUint32(8) === 13) {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2].includes(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const kind = view.getUint32(12);
    if (kind === 0x56503858) {
      if (bytes[20] & 2) throw new Error('Animated images are not supported.');
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 0x5650384c && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  if (!width || !height) throw new Error('Choose a valid JPEG, PNG, or non-animated WebP image.');
  validateDimensions(width, height);
  return { width, height };
}
