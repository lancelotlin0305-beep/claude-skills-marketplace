// [模板] 族⑥b 並列多欄卡:可選前言卡 → N 張並列卡(深色標題列 + 編號徽章 + 條目 + 卡底權重列)→ 結論帶。
// 對應原簡報 A.架構設計、B4/B5、部署模式、委託研究單位、質化效益等頁。
// 元素數量全部可變:欄數 n、每欄條目 n、卡底欄位 n;卡高由最長那欄的內容決定。
const { box } = require('../scripts/engine');
const { icon } = require('../scripts/icons');
const tk = require('../scripts/tokens');

const id = 'columns';
const accepts = c => Array.isArray(c.columns) && c.columns.length >= 2 && !c.hub;

function render(doc, D) {
  const { P, T } = doc, ink = P.ink;
  const W = doc.W, H = doc.H, M = doc.m, CW = doc.contentW;
  const warn = (r, m, ref) => doc.v.warn(r, m, ref);
  const ic = (n, x, y, s, c, o = {}) => doc.push(icon(n, x, y, s, c, { warn, ...o }));
  const hueOf = (it, i) => (it.color && P.hue(it.color)) || (it.concept && P.forConcept(it.concept)) || P.hue(i);
  const gradOf = k => 'xHdr' + k[0].toUpperCase();
  const bandOf = k => 'xBand' + k[0].toUpperCase();

  doc.pageBg().decorBottom();

  // ---------------------------------------------------------------- L1 標題帶(可省略)
  const ch = tk.chrome('16x9');
  let top = ch.contentTop;
  if (D.title) {
    const tb = doc.text(D.title, M, ch.titleBaseline, { size: T.title, weight: 900, fill: ink.title });
    if (D.subtitle) doc.text(D.subtitle, M, ch.subBaseline, { size: T.sub, weight: 500, fill: ink.sub });
    doc.decorTitleRight(tb.right);
  } else {
    top = 40;                       // 無標題帶(內容區滿版頁):內容直接從上緣起
  }

  // ---------------------------------------------------------------- 尺寸求解
  const cols = D.columns;
  const hasIntro = !!D.intro;
  const chev = hasIntro || cols.length > 1 ? 46 : 0;      // 欄間 chevron 通道
  const introW = hasIntro ? Math.round(CW * 0.16) : 0;

  const colGap = chev;
  const availW = CW - (hasIntro ? introW + colGap : 0);
  const colW = Math.round((availW - (cols.length - 1) * colGap) / cols.length);

  const hdrH = 60, badgeR = 30, itemIcon = 58, itemGap = 18, cardPad = 22, footH = 46;
  const itemTextW = colW - cardPad * 2 - itemIcon - itemGap;

  // 每欄的條目斷行 → 卡高由最長欄決定(等高並列)
  const colItems = cols.map(c => (c.items || []).map(it => ({
    ...it, lines: it.lines || doc.wrap(it.text, T.body, itemTextW),
  })));
  const natBodyH = Math.max(...colItems.map(items =>
    items.reduce((a, it) => a + Math.max(itemIcon, it.lines.length * tk.lineHeight(T.body)) + itemGap, 0) + itemGap), 120);
  const hasFoot = cols.some(c => c.footer);

  const cclH = D.conclude ? 92 : 0;
  const gapBand = doc.geo('gap.band');
  const bottomLimit = D.title ? ch.footBaseline - 24 : H - 30;
  const availH = bottomLimit - top - (cclH ? cclH + gapBand : 0);

  // 卡身撐滿可用高度:多出來的空間平均分給條目列(避免內容只佔上半頁、下半整片空白)。
  const natCardH = hdrH + natBodyH + (hasFoot ? footH : 0);
  const bodyH = Math.max(natBodyH, availH - hdrH - (hasFoot ? footH : 0));
  const cardH = hdrH + bodyH + (hasFoot ? footH : 0);
  const maxItems = Math.max(...colItems.map(a => a.length), 1);
  // 額外空間先平均分給條目列,但每列最多加 36px;剩下的讓整組條目垂直置中,
  // 否則兩三個條目會被拉到卡片兩端、分隔線離內容很遠。
  const itemPad = Math.min(36, Math.max(0, (bodyH - natBodyH) / maxItems));

  doc.v.inside('內容總高', box(M, top, CW, cardH + (cclH ? cclH + gapBand : 0)),
               box(M, top, CW, bottomLimit - top), '內容區',
               `減少欄內條目或縮短文案;欄數現 ${cols.length}`);
  doc.v.verticalFill('並列卡列', cardH + (cclH ? cclH + gapBand : 0), bottomLimit - top);

  // ---------------------------------------------------------------- 前言卡
  let cx = M;
  if (hasIntro) {
    const col = hueOf(D.intro, 0);
    const b = box(cx, top, introW, cardH);
    doc.push(`<rect x="${b.x}" y="${b.y + 6}" width="${b.w}" height="${b.h}" rx="16" fill="${col.main}" opacity="0.14"/>`);
    doc.roundRect(b, { r: 16, fill: `url(#${bandOf(col.key)})`, stroke: col.main, sw: 2, filter: 'shadow' });
    const introLines = D.intro.lines || doc.wrap(D.intro.text, T.body, introW - cardPad * 2);
    const introH = 64 + 30 + T.cardTitle + 14 + introLines.length * tk.lineHeight(T.body);
    let iy = b.y + (b.h - introH) / 2 + 64 + 30;
    ic(D.intro.icon || 'target', b.cx - 32, iy - 94, 64, col.main);
    doc.text(D.intro.title, b.cx, iy, { size: T.cardTitle, weight: 800, fill: col.deep, anchor: 'middle' });
    iy += 14;
    const lines = introLines;
    lines.forEach(ln => { iy += tk.lineHeight(T.body); doc.text(ln, b.cx, iy, { size: T.body, weight: 500, fill: ink.body, anchor: 'middle' }); });
    doc.v.inside('前言卡文字', box(b.x + cardPad, b.y + 100, introW - cardPad * 2, iy - b.y - 92), b, '前言卡');
    cx += introW + colGap;
  }

  // ---------------------------------------------------------------- 並列卡
  const chevron = (x, cy, col) => doc.push(
    `<g fill="${col.main}" opacity="0.9"><path d="M${x} ${cy - 15}l13 15l-13 15l-7 0l13 -15l-13 -15z"/>` +
    `<path d="M${x + 15} ${cy - 15}l13 15l-13 15l-7 0l13 -15l-13 -15z"/></g>`);

  const cardBoxes = [];
  cols.forEach((c, i) => {
    const col = hueOf(c, i);
    const b = box(cx, top, colW, cardH);
    cardBoxes.push(b);
    if (i > 0 || hasIntro) chevron(cx - colGap / 2 - 14, b.y + cardH * 0.45, col);

    doc.push(`<rect x="${b.x}" y="${b.y + 6}" width="${b.w}" height="${b.h}" rx="16" fill="${col.main}" opacity="0.14"/>`);
    doc.roundRect(b, { r: 16, fill: '#FFFFFF', stroke: col.main, sw: 2, filter: 'shadow' });
    // 深色標題列(上緣圓角)
    doc.push(`<path d="M${b.x} ${b.y + 16}a16 16 0 0 1 16 -16h${b.w - 32}a16 16 0 0 1 16 16v${hdrH - 16}h${-b.w}z" fill="url(#${gradOf(col.key)})" filter="url(#hdr)"/>`);
    // 編號徽章:騎在標題列左側(貼標語彙,§3.1 例外)
    if (c.badge) {
      doc.push(`<circle cx="${b.x + badgeR + 6}" cy="${b.y + hdrH / 2}" r="${badgeR}" fill="url(#xSph${col.key[0].toUpperCase()})" filter="url(#obj)"/>`);
      doc.text(c.badge, b.x + badgeR + 6, b.y + hdrH / 2 + T.cardTitle * 0.36, { size: T.cardTitle, weight: 900, fill: '#FFFFFF', anchor: 'middle' });
    }
    const tx = b.x + (c.badge ? badgeR * 2 + 22 : cardPad);
    const ht = doc.text(c.title, tx, b.y + hdrH / 2 + T.cardTitle * 0.36, { size: T.cardTitle, weight: 800, fill: '#FFFFFF' });
    doc.v.inside(`欄「${c.title}」標題`, ht, box(b.x, b.y, b.w - 12, hdrH), '標題列');

    // 條目
    const usedH = colItems[i].reduce((a, it) => a + Math.max(itemIcon, it.lines.length * tk.lineHeight(T.body)) + itemPad + itemGap, 0) + itemGap;
    let iy = b.y + hdrH + itemGap + Math.max(0, (bodyH - usedH) / 2);
    colItems[i].forEach((it, j) => {
      const rowH = Math.max(itemIcon, it.lines.length * tk.lineHeight(T.body)) + itemPad;
      if (j > 0) doc.push(`<line x1="${b.x + cardPad}" y1="${iy - itemGap / 2}" x2="${b.x + b.w - cardPad}" y2="${iy - itemGap / 2}" stroke="${col.main}" stroke-width="1.4" stroke-dasharray="5 5" opacity="0.5"/>`);
      doc.push(`<circle cx="${b.x + cardPad + itemIcon / 2}" cy="${iy + rowH / 2}" r="${itemIcon / 2}" fill="${col.light}" stroke="${col.main}" stroke-width="1.4"/>`);
      ic(it.icon, b.x + cardPad + itemIcon / 2 - 17, iy + rowH / 2 - 17, 34, col.main);
      let ty = iy + (rowH - it.lines.length * tk.lineHeight(T.body)) / 2 + T.body * 0.9;
      it.lines.forEach(ln => { doc.text(ln, b.x + cardPad + itemIcon + itemGap, ty, { size: T.body, weight: 500, fill: ink.body }); ty += tk.lineHeight(T.body); });
      iy += rowH + itemGap;
    });
    doc.v.inside(`欄「${c.title}」條目`, box(b.x + cardPad, b.y + hdrH, b.w - cardPad * 2, iy - b.y - hdrH),
                 box(b.x, b.y + hdrH, b.w, bodyH), '卡身');

    // 卡底權重列
    if (c.footer) {
      const fy = b.y + b.h - footH;
      doc.push(`<path d="M${b.x} ${fy}h${b.w}v${footH - 16}a16 16 0 0 1 -16 16h${-(b.w - 32)}a16 16 0 0 1 -16 -16z" fill="${col.light}"/>`);
      const segs = c.footer;
      const totalW = segs.reduce((a, s) => a + doc.tw(s.label, T.sub) + doc.tw(s.value, T.cardTitle) + 10, 0) + (segs.length - 1) * 26;
      let fx = b.x + (b.w - totalW) / 2;
      segs.forEach((s, k) => {
        if (k > 0) { doc.push(`<line x1="${fx - 13}" y1="${fy + 12}" x2="${fx - 13}" y2="${fy + footH - 12}" stroke="${col.main}" stroke-width="1" opacity="0.4"/>`); }
        doc.text(s.label, fx, fy + footH / 2 + 7, { size: T.sub, weight: 500, fill: ink.body });
        fx += doc.tw(s.label, T.sub) + 6;
        doc.text(s.value, fx, fy + footH / 2 + 8, { size: T.cardTitle, weight: 900, fill: col.main });
        fx += doc.tw(s.value, T.cardTitle) + 26;
      });
      doc.v.inside(`欄「${c.title}」卡底`, box(b.x + (b.w - totalW) / 2, fy, totalW, footH), box(b.x, fy, b.w, footH), '卡底列');
    }
    cx += colW + colGap;
  });
  doc.v.noOverlap('並列卡', cardBoxes);

  // ---------------------------------------------------------------- 結論帶
  if (D.conclude) {
    const light = D.conclude.tone !== 'dark';
    const col = P.hue(D.conclude.color || 'blue');
    const cb = box(M, top + cardH + gapBand, CW, cclH);
    if (light) {
      doc.push(`<rect x="${cb.x}" y="${cb.y + 6}" width="${cb.w}" height="${cb.h}" rx="14" fill="${col.main}" opacity="0.12"/>`);
      doc.roundRect(cb, { r: 14, fill: '#FFFFFF', stroke: col.main, sw: 2, filter: 'shadow' });
    } else doc.roundRect(cb, { r: 14, fill: 'url(#xConclude)', filter: 'shadow' });

    const badge = 56, gapT = 26;
    const textW = doc.tw(D.conclude.text, T.conclude);
    const blockW = badge + gapT + textW;
    const kx = M + (CW - blockW) / 2;
    doc.push(`<rect x="${kx}" y="${cb.cy - badge / 2}" width="${badge}" height="${badge}" rx="14" fill="url(#xSph${col.key[0].toUpperCase()})" filter="url(#obj)"/>`);
    ic(D.conclude.icon || 'checkboard', kx + badge / 2 - 16, cb.cy - 16, 32, '#FFFFFF');
    const hi = D.conclude.hi || [];
    let rest = D.conclude.text, spans = '';
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    while (rest.length) {
      const m = re && rest.match(re);
      if (!m) { spans += `<tspan>${doc.esc(rest)}</tspan>`; break; }
      if (m.index > 0) spans += `<tspan>${doc.esc(rest.slice(0, m.index))}</tspan>`;
      spans += `<tspan fill="${light ? col.main : P.signature.highlight.cyan}" font-weight="900">${doc.esc(m[1])}</tspan>`;
      rest = rest.slice(m.index + m[1].length);
    }
    doc.push(`<text x="${kx + badge + gapT}" y="${cb.cy + 13}" font-size="${T.conclude}" font-weight="800" fill="${light ? ink.title : '#FFFFFF'}">${spans}</text>`);
    doc.v.inside('結論帶內容', box(kx, cb.y, blockW, cclH), cb, '結論帶');
  }

  if (D.footnote) doc.text(D.footnote, M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.faint });
  if (D.page) doc.text(D.page, W - M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.faint, anchor: 'end' });
}

module.exports = { id, accepts, render };
