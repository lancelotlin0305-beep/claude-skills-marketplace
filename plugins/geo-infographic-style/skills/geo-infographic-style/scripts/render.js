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
  // 只取「根 <svg …>」開標籤上的 width/height,避免命中 defs/symbol/image 的 width。
  const rootTag = (svg.match(/<svg\b[^>]*>/i) || [''])[0];
  const num = s => { const m = s && s.match(/[\d.]+/); return m ? Math.round(parseFloat(m[0])) : null; };
  let w = num((rootTag.match(/\bwidth="([^"]+)"/i) || [])[1]);
  let h = num((rootTag.match(/\bheight="([^"]+)"/i) || [])[1]);
  // 無 width/height(或為百分比等非數值)時,退回 viewBox 的第 3、4 值。
  if (!w || !h) {
    const vb = (rootTag.match(/viewBox="([^"]+)"/i) || [])[1];
    if (vb) { const p = vb.trim().split(/[\s,]+/).map(Number); if (p.length === 4) { w = w || Math.round(p[2]); h = h || Math.round(p[3]); } }
  }
  w = w || 1680; h = h || 1000;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto('file://' + abs);
  // 等字型真正載完(取代寫死的 800ms),再留短緩衝給濾鏡合成。
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(200);
  await page.screenshot({ path: out });
  await browser.close();
  console.log('輸出:', out, `(${w}x${h} @2x)`);
})().catch(e => { console.error('render 失敗:', e.message); process.exit(1); });
