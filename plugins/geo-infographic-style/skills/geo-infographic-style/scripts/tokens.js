// [核心] 設計權杖載入器。tokens.json 是所有「數量」的唯一出處,本檔是唯一的讀取介面。
// 生成器一律透過這裡取值,不得自行寫死字級/間距/圓角/色票。
//
//   const tk = require('./tokens');
//   const M  = tk.mode('16x9');        // M.W / M.H / M.type.* / M.k
//   const P  = tk.palette('geox-navy');
//   const c  = P.hue(2);               // 依 order 取第 3 色;超出自動循環,不會 crash
//   const g  = tk.geo('gap.band', M);  // 依模式 k 縮放後的間距
//   const t  = tk.threshold('fillRatio');

const fs = require('fs'), path = require('path');
const RAW = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tokens.json'), 'utf8'));

const dig = (obj, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);

/** 取頁面模式。回傳含 W/H/type/weights/k 的物件。 */
function mode(name = '16x9') {
  const m = RAW.modes[name];
  if (!m) throw new Error(`未知頁面模式「${name}」,可用:${Object.keys(RAW.modes).join(' / ')}`);
  return {
    name,
    label: m.label,
    W: m.canvas.w,
    H: m.canvas.h,
    k: m.k,
    anchor: m.anchor,
    type: m.type,
    weights: RAW.weights,
    font: RAW.font.family,
  };
}

/** 取色盤。hue(key|index) 支援索引循環——群組數超過色數時不會 crash(舊生成器的實際故障點)。 */
function palette(name = 'default') {
  const p = RAW.palettes[name];
  if (!p) throw new Error(`未知色盤「${name}」,可用:${Object.keys(RAW.palettes).join(' / ')}`);
  const order = p.order;
  return {
    name,
    order,
    ink: p.ink,
    signature: p.signature || null,
    binding: p.conceptBinding || null,
    /** key 為色名或序號;序號超出時依 order 循環 */
    hue(key) {
      if (typeof key === 'number') return { key: order[key % order.length], ...p.hues[order[key % order.length]] };
      if (p.hues[key]) return { key, ...p.hues[key] };
      throw new Error(`色盤「${name}」沒有色相「${key}」,可用:${order.join(' / ')}`);
    },
    /** 依概念名取固定綁色(deck-anatomy §4 跨頁一致性);查不到回傳 null 由呼叫端決定 */
    forConcept(concept) {
      const k = p.conceptBinding && p.conceptBinding[concept];
      return k && p.hues[k] ? { key: k, ...p.hues[k] } : null;
    },
  };
}

/** 取幾何值並依模式 k 縮放(字級不走這裡,見 mode().type)。 */
function geo(pathStr, m) {
  const v = dig(RAW.geometry, pathStr);
  if (v == null) throw new Error(`tokens.geometry 沒有「${pathStr}」`);
  if (typeof v !== 'number') return v;                 // 陣列/物件原樣回傳
  const k = m && typeof m.k === 'number' ? m.k : 1;
  return Math.round(v * k);
}

/** 取視覺常數(陰影/描邊/虛線)——任何模式都不縮放。 */
const shadow = n => RAW.shadows[n];
const stroke = n => RAW.stroke[n];

/** 取驗收門檻值。 */
function threshold(name) {
  const t = RAW.thresholds[name];
  if (!t) throw new Error(`tokens.thresholds 沒有「${name}」`);
  return t.value;
}
const thresholdRef = name => (RAW.thresholds[name] || {}).ref || '';

/** 取頁面框架基準座標。無該模式專屬 chrome 時,以 16:9 為基準依畫布高度等比縮放
 *  (16:9 專屬版式模板換到 A4 時座標不再錯位;自適應模式高度不定,回傳 16:9 基準值)。 */
function chrome(modeName = '16x9') {
  const c = RAW.pageChrome[modeName];
  if (c) return c;
  const base = RAW.pageChrome['16x9'];
  const m = RAW.modes[modeName];
  if (!m || !m.canvas.h) return base;
  const s = m.canvas.h / 1080;
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * s) : v]));
}

// ---------- 文字量測(全 skill 共用,不再各自定義) ----------
const F = RAW.font;
/** 估算字串寬度:CJK ≈ 字級,半形 ≈ 0.55 字級;weight ≥ 700 時半形改用粗體係數
 *  (0.55 對粗體偏窄——「46%」「PMC」「0%」三頁實測相黏,個案 1.12–1.15 補丁收斂至此)。 */
const textWidth = (s, size, weight = 400) =>
  [...String(s)].reduce((a, ch) => a + (/[\x00-\xff]/.test(ch)
    ? (weight >= 700 ? (F.asciiBoldWidthRatio || 0.63) : F.asciiWidthRatio)
    : F.cjkWidthRatio) * size, 0);
/** CJK 字身高 ≈ 字級 × 0.88(驗收字級時用,見 style-spec §6.4)。 */
const capHeight = size => size * F.capHeightRatio;
/** 預設行高。 */
const lineHeight = size => Math.round(size * F.lineHeightRatio);

/**
 * 依可用寬度自動斷行。英文/數字/代號詞視為不可分割單元,不在詞中間切(style-spec §6.3)。
 * @returns {string[]} 每行文字
 */
function wrap(text, size, maxW) {
  const tokensArr = [];
  let buf = '';
  for (const ch of String(text)) {
    const isWordChar = /[A-Za-z0-9._%+\-/]/.test(ch);
    if (isWordChar) { buf += ch; continue; }
    if (buf) { tokensArr.push(buf); buf = ''; }
    tokensArr.push(ch);
  }
  if (buf) tokensArr.push(buf);

  // 行首禁則:全形收尾標點不得成為行首(「…雲端\n，雙向…」實測),寧可讓該行溢寬一個字元。
  const NO_LEAD = /^[，。、；：！？）」』]$/;
  const lines = [];
  let cur = '';
  for (const t of tokensArr) {
    const cand = cur + t;
    if (cur && textWidth(cand, size) > maxW && !NO_LEAD.test(t)) { lines.push(cur); cur = /^\s$/.test(t) ? '' : t; }
    else cur = cand;
  }
  if (cur.trim()) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * 平衡斷行:短標籤(卡標題、模組名)專用。
 * 純寬度斷行會產生「採購成本最佳／化模組」這種切在詞中間的結果;本函式先算出最少需要幾行,
 * 再把字數盡量均分,並在兩個同樣接近中點的切點中**偏好較早者**(中文較短的首行讀起來較自然)。
 * 英數代號詞仍視為不可分割單元。
 */
function wrapBalanced(text, size, maxW) {
  const s = String(text);
  if (textWidth(s, size) <= maxW) return [s];

  // 切成不可分割單元
  const units = [];
  let buf = '';
  for (const ch of s) {
    if (/[A-Za-z0-9._%+\-/]/.test(ch)) { buf += ch; continue; }
    if (buf) { units.push(buf); buf = ''; }
    units.push(ch);
  }
  if (buf) units.push(buf);

  const total = textWidth(s, size);
  const n = Math.max(2, Math.ceil(total / maxW));
  const target = total / n;
  // 中文複合詞多為雙字,切在奇數字處(如「智能客/服代理人」)明顯不自然 → 給奇數切點加罰分。
  const ODD_PENALTY = size * 0.7;
  const cjkCount = str => [...str].filter(c => !/[\x00-\xff]/.test(c)).length;

  const lines = [];
  let start = 0, remaining = n;
  while (start < units.length && remaining > 0) {
    if (remaining === 1) { lines.push(units.slice(start).join('')); break; }
    let best = null;
    let w = 0;
    for (let end = start + 1; end <= units.length - (remaining - 1); end++) {
      w += textWidth(units[end - 1], size);
      if (w > maxW) break;
      const seg = units.slice(start, end).join('');
      const cost = Math.abs(w - target) + (cjkCount(seg) % 2 ? ODD_PENALTY : 0);
      if (!best || cost < best.cost) best = { end, cost };
    }
    if (!best) best = { end: start + 1 };
    lines.push(units.slice(start, best.end).join(''));
    start = best.end; remaining--;
  }
  return lines.filter(l => l.length);
}

/** XML 逸出(全 skill 共用)。 */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = {
  RAW, mode, palette, geo, shadow, stroke, threshold, thresholdRef, chrome,
  textWidth, capHeight, lineHeight, wrap, wrapBalanced, esc,
};
