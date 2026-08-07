#!/usr/bin/env node
// 用法: NODE_PATH=$(npm root -g) node render.js 圖.svg [輸出.png]
// 讀取 SVG 的 width/height,以 Chromium 截圖輸出 2 倍解析度 PNG。
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const svgPath = process.argv[2];
  if (!svgPath) { console.error('用法: node render.js 圖.svg [輸出.png]'); process.exit(1); }
  const abs = path.resolve(svgPath);
  const out = process.argv[3] ? path.resolve(process.argv[3]) : abs.replace(/\.svg$/i, '.png');

  const svg = fs.readFileSync(abs, 'utf8');
  const w = parseInt((svg.match(/width="(\d+)"/) || [])[1] || '1680', 10);
  const h = parseInt((svg.match(/height="(\d+)"/) || [])[1] || '1000', 10);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto('file://' + abs);
  await page.waitForTimeout(800); // 等字型與濾鏡完成
  await page.screenshot({ path: out });
  await browser.close();
  console.log('輸出:', out, `(${w}x${h} @2x)`);
})();
