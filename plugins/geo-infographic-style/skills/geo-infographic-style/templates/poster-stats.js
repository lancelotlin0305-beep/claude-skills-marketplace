// [模板] poster-stats:大色塊海報風數據頁(Swiss/Bauhaus,poster-bold 色盤專用)。
// 語言:高飽和大色塊**即容器**——滿版出血、直角、無卡無框、色塊間僅細紙色溝縫;超大字直接壓色
// (深色塊白字、亮色塊墨字,TEXTON 表保對比 ≥4.5);強幾何(墨色標題塊 + 大圓弧線)。
// 版面:左墨色標題塊(巨標白字+導言)+ 左下紙色素材塊 ｜ 右 2×N 色塊數據格 ｜ 底部金色結語條(全寬)。
// 內容欄位與 editorial-stats 同構(headline/lead/hero/stats/conclude/footnote),另需 poster:true。
const { box, fitDisplay } = require('../scripts/engine');
const tk = require('../scripts/tokens');

const id = 'poster-stats';
const accepts = c => c.poster === true && Array.isArray(c.headline) && Array.isArray(c.stats);

// 亮色塊(黃/橘/綠/青)用墨字,深色塊用白字——Bauhaus 的黑壓橘、白壓藍
const TEXTON = { blue: '#FFFFFF', purple: '#FFFFFF', red: '#FFFFFF', slate: '#FFFFFF', green: '#101418', orange: '#101418', teal: '#101418', gold: '#101418' };

function render(doc, D) {
  const { P } = doc;
  const W = doc.W, H = doc.H;
  const ink = P.ink;
  const g = 12;                                   // 色塊溝縫(紙色)
  const paper = ink.pageBg, dark = ink.title;

  doc.push(`<rect width="${W}" height="${H}" fill="${paper}"/>`);

  // ---------------------------------------------------------------- 版面分區
  const AX = 0, AW = 748;                          // 左欄
  const stripH = 128;                              // 底部結語條
  const A1 = box(AX, 0, AW, 632);                  // 墨色標題塊
  const A2 = box(AX, A1.bottom + g, AW, H - stripH - g * 2 - A1.bottom - g);   // 紙色素材塊
  const BX = AW + g, BW = W - BX;
  const stats = D.stats;
  const cols = 2, rows = Math.ceil(stats.length / cols);
  const cellW = Math.floor((BW - (cols - 1) * g) / cols);
  const gridBot = H - stripH - g;
  const cellH = Math.floor((gridBot - (rows - 1) * g) / rows);

  // ---------------------------------------------------------------- A1 墨色標題塊(巨標 + 幾何圓)
  doc.push(`<rect x="${A1.x}" y="${A1.y}" width="${A1.w}" height="${A1.h}" fill="${dark}"/>`);
  doc.push(`<circle cx="${A1.x + A1.w + 40}" cy="${A1.y - 60}" r="430" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="88"/>`);
  const gold = P.hue('gold');
  let y = 150;
  doc.push(`<rect x="72" y="${y - 52}" width="64" height="10" fill="${gold.main}"/>`);
  D.headline.forEach(ln => {
    y += 104;
    doc.text(ln, 72, y, { size: 96, weight: 900, fill: '#FFFFFF', ls: 4 });
  });
  y += 54;
  doc.wrap(D.lead, 23, AW - 150).forEach(ln => { doc.text(ln, 72, y, { size: 23, weight: 500, fill: 'rgba(255,255,255,0.82)' }); y += 40; });
  doc.v.inside('標題塊內容', box(72, 60, AW - 144, y - 60), A1, '標題塊', '縮短導言');

  // ---------------------------------------------------------------- A2 紙色素材塊
  if (D.hero) {
    doc.push(`<ellipse cx="${A2.cx}" cy="${A2.cy + Math.round(A2.h * 0.34)}" rx="${A2.w * 0.34}" ry="15" fill="${dark}" opacity="0.1"/>`);
    doc.asset(D.hero, A2.cx, A2.cy - 14, Math.round(A2.h * 0.86));
  }
  if (D.footnote) doc.text(D.footnote, 72, A2.bottom - 22, { size: 15, weight: 400, fill: ink.muted });

  // ---------------------------------------------------------------- B 區 2×N 色塊數據格
  const padB = 56;
  const numSize = Math.min(...stats.map(s =>
    fitDisplay(String(s.value), 168, Math.round((cellW - padB * 2) * 0.9) - (s.unit ? tk.textWidth(s.unit, 30, 700) + 10 : 0))));
  const cellBoxes = [];
  stats.forEach((s, i) => {
    const col = (s.color && P.hue(s.color)) || P.hue(i);
    const tx = TEXTON[col.key] || '#FFFFFF';
    const dim = tx === '#FFFFFF' ? 'rgba(255,255,255,0.85)' : 'rgba(16,20,24,0.78)';
    const cb = box(BX + (i % cols) * (cellW + g), Math.floor(i / cols) * (cellH + g), cellW, cellH);
    cellBoxes.push(cb);
    doc.push(`<rect x="${cb.x}" y="${cb.y}" width="${cb.w}" height="${cb.h}" fill="${col.main}"/>`);
    // 幾何角飾:右上四分之一圓(同色 deep,低調強幾何)
    doc.push(`<path d="M${cb.right} ${cb.y}v150a150 150 0 0 1 -150 -150z" fill="${col.deep}" opacity="0.55"/>`);
    let sy = cb.y + 88;
    doc.text(s.eyebrow, cb.x + padB, sy, { size: 19, weight: 800, fill: dim, ls: 3 });
    sy += Math.round(numSize * 0.88) + 34;
    doc.text(String(s.value), cb.x + padB, sy, { size: numSize, weight: 900, fill: tx, ls: -2 });
    if (s.unit) doc.text(s.unit, cb.x + padB + tk.textWidth(String(s.value), numSize, 900) + 10, sy, { size: 30, weight: 700, fill: dim });
    sy += 56;
    doc.text(s.label, cb.x + padB, sy, { size: 30, weight: 900, fill: tx });
    sy += 12;
    const descW = cellW - padB * 2;
    if (s.desc) doc.wrap(s.desc, 20, descW).forEach(ln => { sy += 33; doc.text(ln, cb.x + padB, sy, { size: 20, weight: 500, fill: dim }); });
    if (s.sub) { sy += 36; doc.text(s.sub, cb.x + padB, sy, { size: 20, weight: 700, fill: dim }); }
    doc.v.inside(`色塊「${s.label}」`, box(cb.x + padB, cb.y + 40, descW, sy - cb.y - 40), cb, '數據色塊', '縮短說明');
  });
  doc.v.noOverlap('數據色塊', cellBoxes);

  // ---------------------------------------------------------------- 底部金色結語條(全寬;hi 詞白底墨字塊)
  if (D.conclude) {
    const sb = box(0, H - stripH, W, stripH);
    doc.push(`<rect x="${sb.x}" y="${sb.y}" width="${sb.w}" height="${sb.h}" fill="${gold.main}"/>`);
    const cSize = 31, cy2 = sb.cy + cSize * 0.36;
    const hi = D.conclude.hi || [];
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    // 逐段繪製:hi 詞加白色色塊底(海報 highlight 語彙)
    const parts = [];
    let rest = D.conclude.text;
    while (rest.length) {
      const mm = re && rest.match(re);
      if (!mm) { parts.push({ t: rest, hi: false }); break; }
      if (mm.index > 0) parts.push({ t: rest.slice(0, mm.index), hi: false });
      parts.push({ t: mm[1], hi: true });
      rest = rest.slice(mm.index + mm[1].length);
    }
    const totW = parts.reduce((a, p2) => a + tk.textWidth(p2.t, cSize, p2.hi ? 900 : 800) + (p2.hi ? 28 : 0), 0);
    let px2 = Math.max(64, (W - totW) / 2);
    parts.forEach(p2 => {
      const w2 = tk.textWidth(p2.t, cSize, p2.hi ? 900 : 800);
      if (p2.hi) {
        doc.push(`<rect x="${px2}" y="${sb.cy - cSize * 0.72}" width="${w2 + 24}" height="${cSize * 1.44}" fill="#FFFFFF"/>`);
        doc.text(p2.t, px2 + 12, cy2, { size: cSize, weight: 900, fill: ink.title });
        px2 += w2 + 28;
      } else {
        doc.text(p2.t, px2, cy2, { size: cSize, weight: 800, fill: ink.title });
        px2 += w2;
      }
    });
    doc.v.inside('結語條內容', box(Math.max(64, (W - totW) / 2), sb.y + 16, Math.min(totW, W - 128), stripH - 32), sb, '結語條', '縮短結語');
  }
  if (D.page) doc.text(D.page, W - 40, H - stripH - 26, { size: 15, weight: 700, fill: ink.muted, ls: 2, anchor: 'end' });
}

module.exports = { id, accepts, render };
