// Dev-only: renders icons/src/*.svg to icons/icon<px>.png. Run: npm run icons
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

for (const { src, px } of jobs) {
  const svg = readFileSync(`${root}icons/src/${src}`, "utf8");
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: px } }).render();
  if (rendered.width !== px || rendered.height !== px) {
    throw new Error(`${src} rendered ${rendered.width}x${rendered.height}, expected ${px}x${px}`);
  }
  if (px === 128) {
    const data = rendered.pixels; // RGBA
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if ((x < 16 || x >= 112 || y < 16 || y >= 112) && data[(y * px + x) * 4 + 3] !== 0) {
          throw new Error(`icon128: non-transparent pixel in padding at (${x}, ${y})`);
        }
      }
    }
  }
  const out = `icons/icon${px}.png`;
  writeFileSync(`${root}${out}`, rendered.asPng());
  console.log(`wrote ${out} (${px}x${px}) from ${src}`);
}
