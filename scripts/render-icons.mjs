// Dev-only: renders icons/src/*.svg to icons/icon<px>.png.
//   npm run icons        write the PNGs
//   npm run icons:check  render in memory and fail if a committed PNG is stale (writes nothing)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = fileURLToPath(new URL("..", import.meta.url));
const jobs = [
  { src: "icon-128.svg", px: 128 },
  { src: "icon-128.svg", px: 48 },
  { src: "icon-32.svg", px: 32 },
  { src: "icon-16.svg", px: 16 },
];

/** Render one job and apply the dimension and 128px padding assertions. Returns PNG bytes. */
function renderAndAssert({ src, px }) {
  const svg = readFileSync(`${root}icons/src/${src}`, "utf8");
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: px } }).render();
  if (rendered.width !== px || rendered.height !== px) {
    throw new Error(`${src} rendered ${rendered.width}x${rendered.height}, expected ${px}x${px}`);
  }
  if (px === 128) {
    const data = rendered.pixels; // RGBA
    let count = 0;
    let first = null;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if ((x < 16 || x >= 112 || y < 16 || y >= 112) && data[(y * px + x) * 4 + 3] !== 0) {
          count++;
          first ??= [x, y];
        }
      }
    }
    if (count > 0) {
      throw new Error(
        `icon128: ${count} non-transparent pixel(s) in the 16px padding, first at (${first[0]}, ${first[1]})`,
      );
    }
  }
  return rendered.asPng();
}

const check = process.argv.includes("--check");
const problems = [];

for (const job of jobs) {
  const png = renderAndAssert(job);
  const out = `icons/icon${job.px}.png`;
  if (check) {
    let committed;
    try {
      committed = readFileSync(`${root}${out}`);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }
    // Renders are byte-compared, so @resvg/resvg-js is pinned; after an upgrade, `npm run icons` is the fix.
    if (!committed) problems.push(`${out} is missing — run npm run icons`);
    else if (!png.equals(committed)) problems.push(`${out} is stale — run npm run icons`);
  } else {
    writeFileSync(`${root}${out}`, png);
    console.log(`wrote ${out} (${job.px}x${job.px}) from ${job.src}`);
  }
}
if (check) {
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    process.exit(1);
  }
  console.log(`icons: ${jobs.length} up to date`);
}
