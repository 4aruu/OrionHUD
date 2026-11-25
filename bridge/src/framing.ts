// Chrome native-messaging framing: a 4-byte length in native byte order,
// then that many bytes of UTF-8 JSON. The bridge uses the same codec on its
// local socket, so there is one framing implementation to get right.

import { endianness } from "node:os";

export const HEADER_BYTES = 4;
const LITTLE = endianness() === "LE";

export class FrameError extends Error {
  constructor(
    public readonly reason: "too-large" | "bad-json" | "empty",
    message: string
  ) {
    super(message);
    this.name = "FrameError";
  }
}

export function encodeFrame(message: unknown, maxBytes: number): Buffer {
  const json = JSON.stringify(message);
  if (json === undefined) throw new FrameError("bad-json", "Message is not JSON-serializable.");
  const body = Buffer.from(json, "utf8");
  if (body.length > maxBytes) throw new FrameError("too-large", `Frame of ${body.length} bytes exceeds ${maxBytes}.`);
  const header = Buffer.alloc(HEADER_BYTES);
  if (LITTLE) header.writeUInt32LE(body.length, 0);
  else header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/**
 * Incremental decoder: feed it chunks as they arrive (frames can be split
 * across chunks or packed several per chunk). Throws FrameError as soon as a
 * header announces an oversized frame, before buffering its body, so a
 * hostile peer can't make us allocate. After a throw the stream is out of
 * sync: the caller must drop the connection.
 */
export class FrameDecoder {
  private chunks: Buffer[] = [];
  private buffered = 0;

  constructor(private readonly maxBytes: number) {}

  push(chunk: Buffer): unknown[] {
    this.chunks.push(chunk);
    this.buffered += chunk.length;
    const out: unknown[] = [];

    for (;;) {
      if (this.buffered < HEADER_BYTES) break;
      const buf = this.flatten();
      const length = LITTLE ? buf.readUInt32LE(0) : buf.readUInt32BE(0);
      if (length === 0) throw new FrameError("empty", "Empty frame.");
      if (length > this.maxBytes) throw new FrameError("too-large", `Frame of ${length} bytes exceeds ${this.maxBytes}.`);
      if (this.buffered < HEADER_BYTES + length) break;

      const body = buf.subarray(HEADER_BYTES, HEADER_BYTES + length);
      const rest = buf.subarray(HEADER_BYTES + length);
      this.chunks = rest.length ? [Buffer.from(rest)] : [];
      this.buffered = rest.length;

      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(body);
        out.push(JSON.parse(text) as unknown);
      } catch {
        throw new FrameError("bad-json", "Frame is not valid UTF-8 JSON.");
      }
    }
    return out;
  }

  /** Bytes received but not yet returned as a complete frame. */
  get pending(): number {
    return this.buffered;
  }

  private flatten(): Buffer {
    if (this.chunks.length !== 1) this.chunks = [Buffer.concat(this.chunks)];
    return this.chunks[0] as Buffer;
  }
}

export interface FrameReader {
  stop(): void;
}

/** Reads frames from a stream. onError fires once and reading stops. */
export function readFrames(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
  onMessage: (msg: unknown) => void,
  onError: (err: FrameError) => void
): FrameReader {
  const decoder = new FrameDecoder(maxBytes);
  let stopped = false;
  const onData = (chunk: Buffer | string) => {
    if (stopped) return;
    try {
      for (const msg of decoder.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)) {
        if (stopped) return;
        onMessage(msg);
      }
    } catch (err) {
      stopped = true;
      stream.removeListener("data", onData);
      onError(err instanceof FrameError ? err : new FrameError("bad-json", String(err)));
    }
  };
  stream.on("data", onData);
  return {
    stop() {
      stopped = true;
      stream.removeListener("data", onData);
    },
  };
}
