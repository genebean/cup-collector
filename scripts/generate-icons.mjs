// Generates PWA icons, favicon, and iOS splash screens using sharp (already in app/node_modules).
// Run from the project root inside the nix dev shell:
//   node scripts/generate-icons.mjs          # icons + favicon only
//   node scripts/generate-icons.mjs --splash  # also regenerate all 15 splash screens

import sharp from "../app/node_modules/sharp/lib/index.js";
import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve("app/public/icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

// SVG icon — dark green circle with a gold coffee cup
function makeSvg(size) {
  const pad = size * 0.15;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Cup proportions scaled to size
  const cupW = size * 0.42;
  const cupH = size * 0.36;
  const cupX = cx - cupW / 2;
  const cupY = cy - cupH * 0.3;
  const handleR = cupW * 0.22;
  const saucerW = cupW * 1.15;
  const saucerH = cupH * 0.13;
  const saucerX = cx - saucerW / 2;
  const saucerY = cupY + cupH;
  const steamY = cupY - size * 0.06;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background circle -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1E3932"/>
  <!-- Steam lines -->
  <path d="M${cx - cupW * 0.15} ${steamY} q${size * 0.025} ${-size * 0.04} 0 ${-size * 0.08} q${-size * 0.025} ${-size * 0.04} 0 ${-size * 0.08}"
    stroke="#CBA258" stroke-width="${size * 0.025}" stroke-linecap="round" fill="none" opacity="0.8"/>
  <path d="M${cx + cupW * 0.15} ${steamY} q${size * 0.025} ${-size * 0.04} 0 ${-size * 0.08} q${-size * 0.025} ${-size * 0.04} 0 ${-size * 0.08}"
    stroke="#CBA258" stroke-width="${size * 0.025}" stroke-linecap="round" fill="none" opacity="0.8"/>
  <!-- Cup body (trapezoid) -->
  <path d="M${cupX + cupW * 0.05} ${cupY} L${cupX + cupW * 0.95} ${cupY} L${cupX + cupW * 0.85} ${cupY + cupH} L${cupX + cupW * 0.15} ${cupY + cupH} Z"
    fill="#CBA258"/>
  <!-- Cup rim -->
  <rect x="${cupX}" y="${cupY - size * 0.02}" width="${cupW}" height="${size * 0.045}" rx="${size * 0.01}" fill="#CBA258"/>
  <!-- Handle -->
  <path d="M${cupX + cupW * 0.85} ${cupY + cupH * 0.25} q${handleR * 1.4} 0 ${handleR * 1.4} ${cupH * 0.35} q0 ${cupH * 0.35} ${-handleR * 1.4} ${cupH * 0.35}"
    stroke="#CBA258" stroke-width="${size * 0.045}" stroke-linecap="round" fill="none"/>
  <!-- Saucer -->
  <ellipse cx="${cx}" cy="${saucerY + saucerH / 2}" rx="${saucerW / 2}" ry="${saucerH}" fill="#CBA258"/>
</svg>`;
}

// Maskable version — same but with extra padding so content sits in the safe zone
function makeMaskableSvg(size) {
  const scale = 0.72; // shrink content to 72% so it's within the 80% safe zone
  const inner = size * scale;
  const offset = (size - inner) / 2;
  const inner_svg = makeSvg(inner).replace(
    `width="${inner}" height="${inner}" viewBox="0 0 ${inner} ${inner}"`,
    `width="${inner}" height="${inner}" viewBox="0 0 ${inner} ${inner}" x="${offset}" y="${offset}"`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#1E3932"/>
  ${inner_svg}
</svg>`;
}

async function generate(svgStr, filename, size) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png()
    .toFile(path.join(OUT_DIR, filename));
  console.log(`  ${filename}`);
}

// Splash screens — icon centered on a solid Deep Forest background.
// The icon SVG has a circular green background that blends into the splash,
// leaving just the gold cup floating on green.
const SPLASH_SIZES = [
  [640,  1136],
  [750,  1334],
  [828,  1792],
  [1080, 2340],
  [1125, 2436],
  [1170, 2532],
  [1179, 2556],
  [1242, 2208],
  [1242, 2688],
  [1284, 2778],
  [1290, 2796],
  [1536, 2048],
  [1668, 2224],
  [1668, 2388],
  [2048, 2732],
];

async function generateSplash(width, height) {
  const iconSize = Math.min(Math.round(Math.min(width, height) * 0.28), 512);
  const iconSvg = Buffer.from(makeSvg(iconSize));
  const iconPng = await sharp(iconSvg).resize(iconSize, iconSize).png().toBuffer();

  const left = Math.round((width  - iconSize) / 2);
  const top  = Math.round((height - iconSize) / 2);

  const filename = `splash-${width}x${height}.png`;
  await sharp({
    create: { width, height, channels: 4, background: { r: 30, g: 57, b: 50, alpha: 1 } },
  })
    .composite([{ input: iconPng, left, top }])
    .png()
    .toFile(path.join(OUT_DIR, "splash", filename));
  console.log(`  splash/${filename}`);
}

console.log("Generating icons…");
await generate(makeSvg(192),  "icon-192.png",          192);
await generate(makeSvg(512),  "icon-512.png",          512);
await generate(makeMaskableSvg(512), "icon-512-maskable.png", 512);

// favicon.ico — 32px PNG placed at /public/favicon.ico
await sharp(Buffer.from(makeSvg(32)))
  .resize(32, 32)
  .png()
  .toFile(path.resolve("app/public/favicon.png"));
fs.renameSync(
  path.resolve("app/public/favicon.png"),
  path.resolve("app/public/favicon.ico")
);
console.log("  ../favicon.ico");

if (process.argv.includes("--splash")) {
  console.log("Generating splash screens…");
  fs.mkdirSync(path.join(OUT_DIR, "splash"), { recursive: true });
  for (const [w, h] of SPLASH_SIZES) await generateSplash(w, h);
}

console.log("Done.");
