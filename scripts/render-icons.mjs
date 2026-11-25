// Dev-only: renders icons/src/*.svg to the PNGs under icons/ (and public/icons/ for the notification icon).
//   npm run icons        write the PNGs
//   npm run icons:check  render in memory and fail if a committed PNG is stale (writes nothing)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { decodeRgba } from "./png-decode.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// `padded`: the store icon keeps its 16px transparent border. `viewBox`: crop the source before
// rendering; notify96 is the 128 art's 96x96 artwork without the padding, so Chrome
// notifications show it full size. It lives in public/ because the manifest never references it,
// so Vite copies it to dist/icons/ in both build and crxjs dev mode.
const jobs = [
  { src: "icon-128.svg", px: 128, out: "icons/icon128.png", padded: true },
  { src: "icon-128.svg", px: 48, out: "icons/icon48.png" },
  { src: "icon-32.svg", px: 32, out: "icons/icon32.png" },
  { src: "icon-16.svg", px: 16, out: "icons/icon16.png" },
  { src: "icon-128.svg", px: 96, out: "public/icons/notify96.png", viewBox: "16 16 96 96" },
];

// Renders are compared with a ±2 tolerance: a committed icon is stale if its size differs or any
// RGBA channel differs by more than TOLERANCE. That absorbs tiny rasterizer differences between
// OS/CPU builds of resvg; real art changes move channels far more. The renderer stays pinned
// (@resvg/resvg-js 2.6.2); after an upgrade, `npm run icons` is the fix.
const TOLERANCE = 2;

/** Read a job's SVG, applying its viewBox crop if it has one. */
function readSvg({ src, viewBox }) {
  const svg = readFileSync(`${root}icons/src/${src}`, "utf8");
  if (!viewBox) return svg;
  const tag = /<svg\b[^>]*>/.exec(svg);
  if (!tag || !/\sviewBox="[^"]*"/.test(tag[0])) throw new Error(`${src}: root <svg> has no viewBox to crop`);
  return svg.replace(tag[0], tag[0].replace(/\sviewBox="[^"]*"/, ` viewBox="${viewBox}"`));
}

/** Render one job and apply the dimension and (padded jobs only) padding assertions. Returns the resvg render. */
function renderAndAssert(job) {
  const { src, px, out, padded } = job;
  const rendered = new Resvg(readSvg(job), { fitTo: { mode: "width", value: px } }).render();
  if (rendered.width !== px || rendered.height !== px) {
    throw new Error(`${out} from ${src} rendered ${rendered.width}x${rendered.height}, expected ${px}x${px}`);
  }
  if (padded) {
    const data = rendered.pixels; // RGBA
    let count = 0;
    let first = null;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if ((x < 16 || x >= px - 16 || y < 16 || y >= px - 16) && data[(y * px + x) * 4 + 3] !== 0) {
          count++;
          first ??= [x, y];
        }
      }
    }
    if (count > 0) {
      throw new Error(
        `${out}: ${count} non-transparent pixel(s) in the 16px padding, first at (${first[0]}, ${first[1]})`,
      );
    }
  }
  return rendered;
}

/**
 * True if the committed PNG matches the fresh render within TOLERANCE on every channel.
 * resvg's `.pixels` are premultiplied RGBA while PNGs store straight alpha, so the committed
 * pixels are premultiplied (round(c * a / 255), as resvg does) before comparing. Comparing in
 * premultiplied space also keeps near-transparent pixels from amplifying rounding noise.
 */
function matches(committed, rendered) {
  if (committed.width !== rendered.width || committed.height !== rendered.height) return false;
  const a = committed.pixels;
  const b = rendered.pixels;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    const alpha = a[i + 3];
    for (let k = 0; k < 4; k++) {
      const value = k === 3 ? alpha : Math.round((a[i + k] * alpha) / 255);
      if (Math.abs(value - b[i + k]) > TOLERANCE) return false;
    }
  }
  return true;
}

const check = process.argv.includes("--check");
const problems = [];

for (const job of jobs) {
  const rendered = renderAndAssert(job);
  const { out } = job;
  if (check) {
    let committed;
    try {
      committed = readFileSync(`${root}${out}`);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
    if (!committed) {
      problems.push(`${out} is missing — run npm run icons`);
      continue;
    }
    let decoded;
    try {
      decoded = decodeRgba(committed);
    } catch (err) {
      problems.push(`${out} can't be read (${err.message}) — run npm run icons`);
      continue;
    }
    if (!matches(decoded, rendered)) problems.push(`${out} is stale — run npm run icons`);
  } else {
    writeFileSync(`${root}${out}`, rendered.asPng());
    console.log(`wrote ${out} (${job.px}x${job.px}) from ${job.src}${job.viewBox ? ` cropped to ${job.viewBox}` : ""}`);
  }
}
if (check) {
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    process.exit(1);
  }
  console.log(`icons: ${jobs.length} up to date`);
}
