import { endianness } from "node:os";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { FrameDecoder, FrameError, HEADER_BYTES, encodeFrame, readFrames } from "../src/framing";

const MAX = 1024;

function header(length: number): Buffer {
  const h = Buffer.alloc(HEADER_BYTES);
  if (endianness() === "LE") h.writeUInt32LE(length, 0);
  else h.writeUInt32BE(length, 0);
  return h;
}

describe("encodeFrame", () => {
  it("prefixes the UTF-8 byte length (not the string length) in native byte order", () => {
    const frame = encodeFrame({ t: "é✓" }, MAX);
    const body = Buffer.from(JSON.stringify({ t: "é✓" }), "utf8");
    expect(frame.subarray(0, 4)).toEqual(header(body.length));
    expect(frame.subarray(4)).toEqual(body);
    expect(body.length).toBeGreaterThan(JSON.stringify({ t: "é✓" }).length);
  });

  it("refuses to build an oversized frame", () => {
    expect(() => encodeFrame({ t: "x".repeat(MAX) }, MAX)).toThrow(FrameError);
  });

  it("refuses values that aren't JSON", () => {
    expect(() => encodeFrame(undefined, MAX)).toThrow(FrameError);
  });
});

describe("FrameDecoder", () => {
  it("round-trips a message", () => {
    const d = new FrameDecoder(MAX);
    expect(d.push(encodeFrame({ a: 1, b: ["x"] }, MAX))).toEqual([{ a: 1, b: ["x"] }]);
    expect(d.pending).toBe(0);
  });

  it("reassembles a frame split byte by byte, including inside the header", () => {
    const d = new FrameDecoder(MAX);
    const frame = encodeFrame({ hello: "world" }, MAX);
    const out: unknown[] = [];
    for (const byte of frame) out.push(...d.push(Buffer.from([byte])));
    expect(out).toEqual([{ hello: "world" }]);
  });

  it("splits several frames packed into one chunk, keeping a trailing partial", () => {
    const d = new FrameDecoder(MAX);
    const a = encodeFrame({ n: 1 }, MAX);
    const b = encodeFrame({ n: 2 }, MAX);
    const c = encodeFrame({ n: 3 }, MAX);
    expect(d.push(Buffer.concat([a, b, c.subarray(0, 6)]))).toEqual([{ n: 1 }, { n: 2 }]);
    expect(d.push(c.subarray(6))).toEqual([{ n: 3 }]);
  });

  it("rejects an oversized frame from its header alone, before the body arrives", () => {
    const d = new FrameDecoder(MAX);
    expect(() => d.push(header(MAX + 1))).toThrow(/exceeds/);
  });

  it("rejects a 4 GB length announcement", () => {
    const d = new FrameDecoder(MAX);
    expect(() => d.push(Buffer.from([0xff, 0xff, 0xff, 0xff]))).toThrow(FrameError);
  });

  it("rejects an empty frame", () => {
    expect(() => new FrameDecoder(MAX).push(header(0))).toThrow(/Empty/);
  });

  it("rejects a body that isn't JSON", () => {
    const body = Buffer.from("{nope", "utf8");
    expect(() => new FrameDecoder(MAX).push(Buffer.concat([header(body.length), body]))).toThrow(/JSON/);
  });

  it("rejects invalid UTF-8", () => {
    const body = Buffer.from([0x22, 0xc3, 0x28, 0x22]); // "\xC3(" is not valid UTF-8
    expect(() => new FrameDecoder(MAX).push(Buffer.concat([header(body.length), body]))).toThrow(/UTF-8/);
  });
});

describe("readFrames", () => {
  it("delivers messages from a stream and stops after the first error", async () => {
    const stream = new PassThrough();
    const got: unknown[] = [];
    const errors: FrameError[] = [];
    readFrames(stream, MAX, (m) => got.push(m), (e) => errors.push(e));
    stream.write(encodeFrame({ n: 1 }, MAX));
    stream.write(header(MAX + 1));
    stream.write(encodeFrame({ n: 2 }, MAX));
    await new Promise((r) => setImmediate(r));
    expect(got).toEqual([{ n: 1 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reason).toBe("too-large");
  });
});
