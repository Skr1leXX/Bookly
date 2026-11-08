// Builds docs/booking-demo.gif from the frames captured by the "booking gif" test (docs/.frames/NN.png).
// Run via `npm run demo:gif`. The GIF is written with a small pure-JS encoder, no ffmpeg needed.
import fs from "node:fs";
import { GIFEncoder, applyPalette, quantize } from "../node_modules/gifenc/dist/gifenc.esm.js";
import pngjs from "pngjs";
const { PNG } = pngjs;

const dir = new URL("../docs/.frames/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
if (!files.length) throw new Error("no frames: run the screenshot test first");

const WIDTH = 340;
/** Box-filter downscale of an RGBA bitmap to WIDTH pixels wide. */
function scale({ data, width, height }) {
  const w = WIDTH, h = Math.round((height * w) / width), out = new Uint8Array(w * h * 4), k = width / w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.floor((x + 1) * k)), y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.floor((y + 1) * k));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * width + xx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    out.set([r / n, g / n, b / n, 255], (y * w + x) * 4);
  }
  return { data: out, width: w, height: h };
}

const gif = GIFEncoder();
const DELAY = { default: 1300, last: 2800 };
files.forEach((f, i) => {
  const img = scale(PNG.sync.read(fs.readFileSync(new URL(f, dir))));
  const palette = quantize(img.data, 128);
  gif.writeFrame(applyPalette(img.data, palette), img.width, img.height, { palette, delay: i === files.length - 1 ? DELAY.last : DELAY.default });
});
gif.finish();
const out = new URL("../docs/booking-demo.gif", import.meta.url);
fs.writeFileSync(out, gif.bytes());
console.log(`docs/booking-demo.gif: ${files.length} frames, ${(gif.bytes().length / 1024) | 0} KB`);
