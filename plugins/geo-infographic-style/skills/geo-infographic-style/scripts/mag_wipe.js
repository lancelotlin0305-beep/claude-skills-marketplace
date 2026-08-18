// 洋紅色相清除:R、B 同時明顯高於 G 的像素(洋紅反射/陰影/色偏)去飽和成中性灰,可選降 alpha。
// 與 chroma_key 的「顏色距離」互補——深色洋紅陰影的色距與灰色機身重疊,距離法拉高容差必誤蝕,
// 色相法只看 min(R-G, B-G),灰(R≈G≈B)、紫(B>>R)、暖色(B<G)皆不受影響。
// 用法: NODE_PATH=$(npm root -g) node mag_wipe.js [--lo=25] [--span=40] [--fade=0.55] <png...>
//   --lo    洋紅強度門檻(低於不處理)。殘影清除用預設 25;溫和「色偏校正」降到 8–12。
//   --span  門檻到全強度的過渡區間(羽化)。
//   --fade  全強度像素的 alpha 削減比例(0=只去色不動透明度;殘影清除用 0.55)。
const { chromium } = require('playwright');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? parseFloat(a.split('=')[1]) : d; };
const LO = opt('lo', 25), SPAN = opt('span', 40), FADE = opt('fade', 0.55);
const files = args.filter(a => !a.startsWith('--'));
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    const out = await pg.evaluate(async ({ b64, LO, SPAN, FADE }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        const r = p[i], g = p[i + 1], bl = p[i + 2];
        const mag = Math.min(r - g, bl - g);          // 洋紅強度
        if (mag <= LO) continue;
        const t = Math.min(1, (mag - LO) / SPAN);
        p[i] = Math.round(r - (r - g) * t);           // R/B 往 G 靠攏 → 去洋紅成灰
        p[i + 2] = Math.round(bl - (bl - g) * t);
        p[i + 3] = Math.round(p[i + 3] * (1 - FADE * t));
      }
      x.putImageData(d, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, { b64, LO, SPAN, FADE });
    fs.writeFileSync(f, Buffer.from(out, 'base64'));
    console.log(`wiped ${f} (lo=${LO} span=${SPAN} fade=${FADE})`);
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
