// Dev-only: minimal PNG decoder for the icon check. Supports exactly what
// resvg writes: 8-bit RGBA (color type 6), non-interlaced. Anything else throws.
import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode an 8-bit RGBA PNG into { width, height, pixels } (pixels: RGBA bytes, row-major, unfiltered). */
export function decodeRgba(buffer) {
  const buf = Buffer.from(buffer);
  if (buf.length < SIGNATURE.length || !buf.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new Error("not a PNG (bad signature)");
  }

  let header = null;
  const idat = [];
  let ended = false;
  for (let pos = SIGNATURE.length; pos < buf.length && !ended; ) {
    if (pos + 12 > buf.length) throw new Error("truncated PNG chunk");
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const start = pos + 8;
    const end = start + length;
    if (end + 4 > buf.length) throw new Error(`truncated PNG chunk ${type}`);
    const data = buf.subarray(start, end);
    if (header === null && type !== "IHDR") throw new Error("PNG does not start with IHDR");
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      ended = true;
    }
    pos = end + 4; // skip CRC
  }
  if (!header) throw new Error("PNG has no IHDR");
  if (!ended) throw new Error("PNG has no IEND");

  const { width, height, bitDepth, colorType, compression, filter, interlace } = header;
  if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filter !== 0 || interlace !== 0) {
    throw new Error(
      `unsupported PNG format (bit depth ${bitDepth}, color type ${colorType}, interlace ${interlace}); ` +
        "expected 8-bit RGBA, non-interlaced, as written by resvg",
    );
  }

  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (stride + 1)) {
    throw new Error(`PNG image data is ${raw.length} bytes, expected ${height * (stride + 1)} for ${width}x${height}`);
  }

  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = y * stride - stride; // start of the previous output row (only read when y > 0)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[out + x - bpp] : 0; // left
      const b = y > 0 ? pixels[prev + x] : 0; // up
      const c = x >= bpp && y > 0 ? pixels[prev + x - bpp] : 0; // up-left
      let predictor;
      switch (type) {
        case 0: predictor = 0; break;
        case 1: predictor = a; break;
        case 2: predictor = b; break;
        case 3: predictor = (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`PNG row ${y} has unknown filter type ${type}`);
      }
      pixels[out + x] = (line[x] + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}
