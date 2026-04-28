const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 600;

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }

  const firstCommaIndex = dataUrl.indexOf(',');
  if (firstCommaIndex === -1) {
    return null;
  }

  const metadata = dataUrl.slice(5, firstCommaIndex);
  const payload = dataUrl.slice(firstCommaIndex + 1);
  const metadataParts = metadata.split(';').map(part => part.trim()).filter(Boolean);
  const mimeType = (metadataParts.shift() || '').toLowerCase();
  const isBase64 = metadataParts.includes('base64');

  if (!mimeType.startsWith('image/')) {
    return null;
  }

  let buffer;

  try {
    if (isBase64) {
      buffer = Buffer.from(payload, 'base64');
    } else {
      buffer = Buffer.from(decodeURIComponent(payload), 'utf8');
    }
  } catch (error) {
    return null;
  }

  if (!buffer.length) {
    return null;
  }

  return {
    mimeType,
    buffer,
  };
}

function readPngDimensions(buffer) {
  if (buffer.length < 24) {
    return null;
  }

  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];

    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) {
      return null;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      return null;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      if (offset + 9 >= buffer.length) {
        return null;
      }

      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readWebpDimensions(buffer) {
  if (buffer.length < 30) {
    return null;
  }

  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    return null;
  }

  const chunkType = buffer.subarray(12, 16).toString('ascii');

  if (chunkType === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === 'VP8L') {
    const bits = buffer.readUInt32LE(21);

    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunkType === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  return null;
}

function parseSvgLength(value) {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/^([0-9]+(?:\.[0-9]+)?)(px)?$/i);
  return match ? Number(match[1]) : null;
}

function readSvgDimensions(buffer) {
  const source = buffer.toString('utf8');
  const svgTagMatch = source.match(/<svg\b[^>]*>/i);

  if (!svgTagMatch) {
    return null;
  }

  const tag = svgTagMatch[0];
  const widthMatch = tag.match(/\bwidth=["']([^"']+)["']/i);
  const heightMatch = tag.match(/\bheight=["']([^"']+)["']/i);
  const viewBoxMatch = tag.match(/\bviewBox=["']([^"']+)["']/i);

  let width = parseSvgLength(widthMatch?.[1] || null);
  let height = parseSvgLength(heightMatch?.[1] || null);

  if ((width == null || height == null) && viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      width = width ?? parts[2];
      height = height ?? parts[3];
    }
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return { width, height };
}

function getImageDimensions(parsed) {
  switch (parsed.mimeType) {
    case 'image/png':
      return readPngDimensions(parsed.buffer);
    case 'image/jpeg':
    case 'image/jpg':
      return readJpegDimensions(parsed.buffer);
    case 'image/webp':
      return readWebpDimensions(parsed.buffer);
    case 'image/svg+xml':
      return readSvgDimensions(parsed.buffer);
    default:
      return null;
  }
}

function validateAvatarDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);

  if (!parsed) {
    return {
      ok: false,
      message: 'Az avatar érvénytelen vagy nem feldolgozható kép formátumú data URL.',
    };
  }

  if (parsed.buffer.length > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      message: 'Az avatar legfeljebb 4 MB lehet.',
    };
  }

  const dimensions = getImageDimensions(parsed);

  if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)) {
    return {
      ok: false,
      message: 'Az avatar mérete nem olvasható ki. Csak szabványos PNG, JPEG, WebP vagy SVG kép engedélyezett.',
    };
  }

  if (dimensions.width > MAX_AVATAR_DIMENSION || dimensions.height > MAX_AVATAR_DIMENSION) {
    return {
      ok: false,
      message: 'Az avatar legfeljebb 600×600 képpont lehet.',
    };
  }

  return {
    ok: true,
    bytes: parsed.buffer.length,
    dimensions,
    mimeType: parsed.mimeType,
  };
}

module.exports = {
  MAX_AVATAR_BYTES,
  MAX_AVATAR_DIMENSION,
  validateAvatarDataUrl,
};
