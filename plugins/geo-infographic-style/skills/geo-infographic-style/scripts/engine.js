// [核心] 排版引擎。座標不寫死,由內容量測後解出來。
// 模板只宣告「這頁有哪些帶、每帶有哪些項」,尺寸與位置由本檔計算,並由 validator 驗收。
//
//   const { Doc } = require('./engine');
//   const doc = new Doc({ mode: '16x9', palette: 'geox-navy' });
//   const row = doc.grid(items.length, { x: doc.M, w: doc.contentW, gap: 24 });
//   doc.validate();   // 任何溢出/淨距/填充率不過 → 拋錯,不會靜默產出壞圖
//
// 設計原則(對應 style-spec):
//   §3.1 容器尺寸 = 內容 + 內距,嚴禁由外層反推 → fitBox() / distribute()
//   §6.1 字級依模式錨定,不縮字 → 只有「大數字」這類展示元素允許依寬度回推(fitDisplay)
//   §6.3 塞不下 → 重新斷行 → 縮短文案 → 拆圖;引擎不自動縮字,改由 validator 報錯
const fs = require('fs'), path = require('path');
const tk = require('./tokens');

// ---------------------------------------------------------------- Box
class Box {
  constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); }
  get right() { return this.x + this.w; }
  get bottom() { return this.y + this.h; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  inset(t, r = t, b = t, l = r) { return new Box(this.x + l, this.y + t, this.w - l - r, this.h - t - b); }
  /** 本框是否完全在 outer 內 */
  within(outer, tol = 0.5) {
    return this.x >= outer.x - tol && this.y >= outer.y - tol &&
           this.right <= outer.right + tol && this.bottom <= outer.bottom + tol;
  }
  /** 與另一框的最小淨距(重疊回傳負值) */
  clearanceTo(o) {
    const dx = Math.max(o.x - this.right, this.x - o.right);
    const dy = Math.max(o.y - this.bottom, this.y - o.bottom);
    if (dx >= 0 || dy >= 0) return Math.max(dx, dy);
    return -Math.min(this.right - o.x, o.right - this.x, this.bottom - o.y, o.bottom - this.y);
  }
}
const box = (x, y, w, h) => new Box(x, y, w, h);

// ---------------------------------------------------------------- Validator
class Validator {
  constructor() { this.issues = []; }
  _add(level, rule, msg, ref) { this.issues.push({ level, rule, msg, ref }); }

  /** 元素必須完全落在容器內(最常見的靜默故障:第 N 張卡跑到畫布外) */
  inside(name, child, parent, parentName = '容器') {
    if (!child.within(parent)) {
      const over = [
        child.x < parent.x ? `左溢 ${(parent.x - child.x).toFixed(1)}` : '',
        child.y < parent.y ? `上溢 ${(parent.y - child.y).toFixed(1)}` : '',
        child.right > parent.right ? `右溢 ${(child.right - parent.right).toFixed(1)}` : '',
        child.bottom > parent.bottom ? `下溢 ${(child.bottom - parent.bottom).toFixed(1)}` : '',
      ].filter(Boolean).join('、');
      this._add('error', 'overflow', `「${name}」超出${parentName}:${over}px`, '§3.1');
    }
  }
  /** 子元件與容器框、或並排元件之間的淨距 */
  clearance(name, a, b, min, ref = '§3.1') {
    const c = a.clearanceTo(b);
    if (c < min - 0.5) this._add('error', 'clearance', `「${name}」淨距 ${c.toFixed(1)}px < 下限 ${min}px`, ref);
  }
  /** 容器填充率(容器尺寸是否由內容決定的代理檢查) */
  fill(name, usedW, totalW, kind = 'default') {
    const min = kind === 'band' ? tk.threshold('fillRatioDistributionBand')
              : kind === 'page' ? 0
              : tk.threshold('fillRatio');
    if (min === 0) return;
    const r = usedW / totalW;
    if (r < min - 0.001) {
      this._add('error', 'fill', `「${name}」填充率 ${(r * 100).toFixed(1)}% < 門檻 ${(min * 100)}%`, tk.thresholdRef('fillRatio'));
    }
  }
  /** 字級下限(下限不是目標,但低於下限一定不行) */
  font(name, size) {
    if (size < tk.threshold('minAnyPx')) this._add('error', 'font', `「${name}」字級 ${size} < 全圖下限 ${tk.threshold('minAnyPx')}`, '§6.2');
  }
  /** 一組元素兩兩不得重疊 */
  noOverlap(name, boxes) {
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].clearanceTo(boxes[j]) < 0) {
        this._add('error', 'overlap', `「${name}」第 ${i + 1} 與第 ${j + 1} 項重疊`, '§4');
      }
    }
  }
  warn(rule, msg, ref) { this._add('warn', rule, msg, ref); }

  get errors() { return this.issues.filter(i => i.level === 'error'); }
  format() {
    if (!this.issues.length) return '  自檢通過:無問題';
    return this.issues.map(i => `  [${i.level === 'error' ? '✗' : '!'}] ${i.rule.padEnd(9)} ${i.msg}${i.ref ? '  (' + i.ref + ')' : ''}`).join('\n');
  }
}

// ---------------------------------------------------------------- 版面求解
/** 數量驅動等寬網格:欄數由 count 決定,不寫死。 */
function grid(count, { x, w, gap }) {
  if (count < 1) return [];
  const cw = (w - (count - 1) * gap) / count;
  return Array.from({ length: count }, (_, i) => box(x + i * (cw + gap), 0, cw, 0));
}

/**
 * 內容驅動分佈:每項寬度 = 自身內容寬 + 內距,間距由剩餘空間均分。
 * 用於「分佈帶」等寬度不該等分的情況(style-spec §3.1 例外②)。
 */
function distribute(contentWidths, { x, w, pad = 0, minGap = 12 }) {
  const ws = contentWidths.map(c => c + pad * 2);
  const total = ws.reduce((a, b) => a + b, 0);
  const gap = ws.length > 1 ? Math.max(minGap, (w - total) / (ws.length - 1)) : 0;
  let cx = x;
  return ws.map(cw => { const b = box(cx, 0, cw, 0); cx += cw + gap; return b; });
}

/** 垂直堆疊:每帶高度由自身內容決定,y 依序累加。回傳每帶的 y。 */
function stackV(heights, { top, gap }) {
  let y = top;
  return heights.map(h => { const r = y; y += h + gap; return r; });
}

/**
 * 容器尺寸由內容回推(§3.1 首條)。
 * @param parts 內容元件寬度陣列(不含內距與彼此間距)
 */
const fitBox = (parts, { padX = 24, gap = 0 }) =>
  parts.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1) + padX * 2;

/**
 * 展示型數字依可用寬度回推字級(唯一允許「縮字」的情形:大數字不是內文)。
 * 其餘文字塞不下一律報錯,由模板改斷行或縮短文案。
 */
function fitDisplay(text, maxSize, availW) {
  const unit = tk.textWidth(text, 100) / 100;
  return Math.min(maxSize, Math.floor(availW / unit));
}

// ---------------------------------------------------------------- Doc
class Doc {
  constructor({ mode = '16x9', palette = 'geox-navy', defs = null } = {}) {
    this.mode = tk.mode(mode);
    this.P = tk.palette(palette);
    this.T = this.mode.type;
    this.W = this.mode.W;
    this.H = this.mode.H;
    this.m = tk.geo('margin', this.mode);
    this.page = box(0, 0, this.W, this.H);
    this.safe = box(this.m, 0, this.W - 2 * this.m, this.H);
    this.v = new Validator();
    this.out = [];
    this._defsFile = defs || (palette === 'geox-navy' ? 'defs.geox.svg' : 'defs.svg');
  }
  get contentW() { return this.W - 2 * this.m; }

  push(...s) { this.out.push(...s); return this; }
  tw(s, size) { return tk.textWidth(s, size); }
  wrap(s, size, maxW) { return tk.wrap(s, size, maxW); }
  esc(s) { return tk.esc(s); }
  geo(p) { return tk.geo(p, this.mode); }

  /** 文字元素:回傳它佔用的 Box,方便交給 validator */
  text(s, x, y, { size, weight, fill, anchor = 'start', ls } = {}) {
    this.v.font(String(s).slice(0, 8), size);
    const w = this.tw(s, size);
    this.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}>${this.esc(s)}</text>`);
    const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return box(bx, y - tk.capHeight(size), w, tk.capHeight(size) * 1.15);
  }

  roundRect(b, { r = 16, fill = 'none', stroke: st = null, sw = 2, filter = null, opacity = null } = {}) {
    this.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}" fill="${fill}"` +
      `${st ? ` stroke="${st}" stroke-width="${sw}"` : ''}${filter ? ` filter="url(#${filter})"` : ''}${opacity != null ? ` opacity="${opacity}"` : ''}/>`);
    return b;
  }

  /** 卡片:厚度邊 + 主體(style-spec §2 立體四件套之一、二) */
  card(b, col, { fillId = null, r = null } = {}) {
    const rad = r ?? this.geo('radius.card');
    this.push(`<rect x="${b.x}" y="${b.y + tk.shadow('thicknessEdge').dy}" width="${b.w}" height="${b.h}" rx="${rad}" fill="${col.main}" opacity="${tk.shadow('thicknessEdge').opacity}"/>`);
    this.roundRect(b, { r: rad, fill: fillId ? `url(#${fillId})` : '#FFFFFF', stroke: col.main, sw: tk.stroke('card'), filter: 'shadow' });
    return b;
  }

  /** 膠囊:寬度由內容決定(§3.1) */
  pill(text, x, y, col, { size = null, padX = null, h = 38, r = null, gradId = null } = {}) {
    const fs = size ?? this.T.pill, px = padX ?? 15;
    const w = this.tw(text, fs) + px * 2;
    const rad = r ?? h / 2;
    this.push(`<g filter="url(#row)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" fill="${gradId ? `url(#${gradId})` : col.main}"/></g>`);
    this.text(text, x + w / 2, y + h / 2 + fs * 0.36, { size: fs, weight: this.mode.weights.pill, fill: '#FFFFFF', anchor: 'middle' });
    return box(x, y, w, h);
  }

  /** 一段可自動斷行的文字塊:回傳實際佔用高度 */
  paragraph(s, x, y, maxW, { size = null, weight = null, fill = null, lh = null } = {}) {
    const fs = size ?? this.T.body;
    const lines = Array.isArray(s) ? s : this.wrap(s, fs, maxW);
    const step = lh ?? tk.lineHeight(fs);
    lines.forEach((ln, i) => this.text(ln, x, y + i * step, { size: fs, weight: weight ?? this.mode.weights.body, fill: fill ?? this.P.ink.body }));
    return box(x, y - tk.capHeight(fs), Math.max(...lines.map(l => this.tw(l, fs))), (lines.length - 1) * step + tk.capHeight(fs) * 1.15);
  }

  // ---- 產出 ----
  defs() {
    const p = path.join(__dirname, '..', 'assets', this._defsFile);
    return fs.readFileSync(p, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[\s\S]*?<defs>/, '').replace(/<\/defs>[\s\S]*/, '');
  }
  /** 驗收:有 error 就拋,不容許靜默產出壞圖 */
  validate({ strict = true } = {}) {
    const rep = this.v.format();
    if (this.v.errors.length) {
      console.error('自檢未通過:\n' + rep);
      if (strict) throw new Error(`版面自檢有 ${this.v.errors.length} 項錯誤,已中止輸出`);
    } else {
      console.log(rep);
    }
    return this;
  }
  toSVG() {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}" font-family="${this.mode.font}">`,
      `<defs>${this.defs()}</defs>`,
      ...this.out,
      '</svg>',
    ].join('\n');
  }
  write(file) { fs.writeFileSync(file, this.toSVG()); console.log('OK', file); return this; }
}

module.exports = { Doc, Box, box, Validator, grid, distribute, stackV, fitBox, fitDisplay, tk };
