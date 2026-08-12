// [共用] 頁面模式與字級錨定的唯一程式出處。對應 references/style-spec.md §6.1(字級)與 §10.1(換算)。
// 任何生成器都必須先宣告自己的模式,再從這裡取字級與間距係數,不得自行寫死字級。
//
//   const { mode } = require('./page_modes');
//   const M = mode('16x9');        // M.W / M.H / M.type.* / M.k
//
// 三種模式的觀看距離不同,字級各自錨定(不是互相縮放):
//   adaptive 螢幕 100% 檢視 → 絕對 px
//   16x9     投影 3–10m    → 佔畫布高度 %
//   a4       紙本 40cm     → 實體 pt(1240px 對應 210mm;1pt ≈ 2.08px)

const MODES = {
  adaptive: {
    W: 1720, H: null,               // 高度依內容延展
    anchor: 'px',
    k: 0.73,                        // 間距係數(見下方說明)
    type: { title: 40, lead: 26, conclude: 26, cardTitle: 22, tile: 18, subCard: 17, sub: 17, body: 16, note: 15, pill: 14.5, foot: 13, big: 44, bigUnit: 18 },
  },
  '16x9': {
    W: 1920, H: 1080,
    anchor: 'pct',                  // type 值 = 該百分比 × 1080
    k: 1.00,                        // 基準模式
    pct: { title: 5.2, lead: 3.0, conclude: 3.5, cardTitle: 2.4, tile: 2.2, subCard: 2.0, sub: 1.9, body: 2.0, note: 1.9, pill: 1.9, foot: 1.4, big: 6.5, bigUnit: 2.8 },
    type: { title: 56, lead: 32, conclude: 38, cardTitle: 26, tile: 24, subCard: 22, sub: 20, body: 22, note: 20, pill: 20, foot: 15, big: 70, bigUnit: 30 },
  },
  a4: {
    W: 1240, H: 1754,
    anchor: 'pt',                   // type 值 = pt × 2.08
    k: 1.00,
    pt: { title: 24, lead: 14, conclude: 14, cardTitle: 13, tile: 12, subCard: 11, sub: 11, body: 10.5, note: 10, pill: 9.5, foot: 8, big: 30, bigUnit: 13 },
    type: { title: 50, lead: 29, conclude: 29, cardTitle: 27, tile: 25, subCard: 23, sub: 23, body: 22, note: 21, pill: 20, foot: 17, big: 62, bigUnit: 27 },
  },
};

// 間距係數 k:間距/內距/圓角/徽章半徑/圖示尺寸 一律 = 基準值 × k。
// k = 該模式內文字級 ÷ 16:9 內文字級 —— 讓留白隨字大小走,而非隨畫布尺寸走。
// (不可用「畫布高度比」:A4 高 1754 但寬僅 1240,依高度放大會橫向溢出。)
// 陰影 dy/blur、描邊寬、虛線 dasharray 屬視覺常數,**不套 k**。

function mode(name) {
  const m = MODES[name];
  if (!m) throw new Error(`未知頁面模式「${name}」,可用:${Object.keys(MODES).join(' / ')}`);
  return m;
}

// 依基準畫布(16:9)的絕對值換算到目標模式的間距/尺寸
const scale = (m, v) => Math.round(v * m.k);

module.exports = { MODES, mode, scale };
