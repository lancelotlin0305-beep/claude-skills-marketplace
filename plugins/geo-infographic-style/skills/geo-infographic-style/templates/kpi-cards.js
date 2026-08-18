// [模板] KPI 數據卡列:N 張(2–5)等高等寬並列數據卡 → 結論帶。對應版型判斷表「呈現佔比/數據」列。
// 每卡由上至下:識別色線(卡頂圓角色帶)→ 模組名稱(title,選填)→ 圖示/素材 → 小字說明 + 大數字
// (fitDisplay 依寬回推、全列同字級)→ 代表事項(label,選填)→ 分隔線 + 一行解釋(desc)或次要統計(second,選填;
// 「規劃中」等預留語意依 §1/§3 用灰色時鐘系統)。分隔線只在有底部內容時繪製。
// 等寬欄取最小(§3.1):先等分欄寬,governing 內容填不滿 75% 時欄寬縮到內容寬、整列置中。
const { box, grid, fitDisplay } = require('../scripts/engine');
const { icon } = require('../scripts/icons');
const tk = require('../scripts/tokens');

const id = 'kpi-cards';
const accepts = c => Array.isArray(c.cards) && c.cards.length >= 2 && c.cards.length <= 5 &&
                     c.cards.every(k => k.value != null) && !c.columns && !c.hub;

function render(doc, D) {
  const { P, T } = doc, ink = P.ink;
  const W = doc.W, H = doc.H, M = doc.m, CW = doc.contentW;
  const warn = (r, m, ref) => doc.v.warn(r, m, ref);
  const ic = (n, x, y, s, c, o = {}) => doc.push(icon(n, x, y, s, c, { warn, ...o }));
  const hueOf = (it, i) => (it.color && P.hue(it.color)) || (it.concept && P.forConcept(it.concept)) || P.hue(i);

  doc.pageBg().decorBottom();

  // ---------------------------------------------------------------- L1 標題帶
  const ch = tk.chrome(doc.mode.name);
  let top = ch.contentTop;
  if (D.title) {
    const tb = doc.text(D.title, M, ch.titleBaseline, { size: T.title, weight: 900, fill: ink.title });
    if (D.subtitle) doc.text(D.subtitle, M, ch.subBaseline, { size: T.sub, weight: 500, fill: ink.muted });
    doc.decorTitleRight(tb.right);
  } else top = 40;

  // ---------------------------------------------------------------- 尺寸求解(先算後畫)
  const cards = D.cards;
  const cclH = D.conclude ? ch.concludeHeight : 0;
  const gapBand = doc.geo('gap.band');
  const bottomLimit = D.title ? ch.footBaseline - 24 : H - 30;
  const cardH = bottomLimit - top - (cclH ? cclH + gapBand : 0);

  const colGap = doc.geo('gap.col');
  const cardPad = doc.geo('padding.cardX');
  const padY = doc.geo('padding.cardY');
  const barH = doc.geo('radius.card');            // 識別色線 = 卡頂圓角色帶,高度即卡圓角
  const iconZone = 170, assetSize = Math.round(iconZone * 0.75);
  const unitSize = T.bigUnit, unitGap = 6;
  const maxBig = Math.round(T.big * 1.6);

  // 量測(依 innerW):大數字全列同字級;各帶寬高與 governing 內容寬
  const measure = innerW => {
    const bigSize = Math.min(...cards.map(c =>
      fitDisplay(String(c.value), maxBig, Math.round(innerW * 0.88) - (c.unit ? tk.textWidth(c.unit, unitSize) + unitGap : 0))));
    const secondSize = Math.round(bigSize * 0.45);
    const meas = cards.map(c => {
      const labelLines = c.label ? (c.labelLines || tk.wrapBalanced(c.label, T.tile, innerW)) : null;
      const descLines = c.desc ? (Array.isArray(c.desc) ? c.desc : doc.wrap(c.desc, T.body, innerW)) : null;
      const bigW = tk.textWidth(String(c.value), bigSize) + (c.unit ? unitGap + tk.textWidth(c.unit, unitSize) : 0);
      let secondW = 0;
      if (c.second) {
        secondW = 26 + 8 + (c.second.prefix ? tk.textWidth(c.second.prefix, T.note) + 8 : 0) +
                  tk.textWidth(String(c.second.value), secondSize, 900) + 14 + tk.textWidth(c.second.label, T.note);
      }
      const bottomH = descLines ? descLines.length * tk.lineHeight(T.body)
                    : c.second ? Math.round(tk.capHeight(secondSize) * 1.4) : 0;
      const widths = [
        tk.textWidth(c.title || '', T.cardTitle), tk.textWidth(c.prefix || '', T.note),
        bigW, secondW, assetSize * 1.35,
        ...(labelLines || []).map(l => tk.textWidth(l, T.tile)),
        ...(descLines || []).map(l => tk.textWidth(l, T.body)),
      ];
      return { labelLines, descLines, bigW, secondW, bottomH, contentW: Math.max(...widths) };
    });
    return { bigSize, secondSize, meas };
  };

  // 先等分;governing 填不滿 75% → 欄寬縮到內容寬,整列置中(§3.1 等寬欄取最小)
  let colW = grid(cards.length, { x: M, w: CW, gap: colGap })[0].w;
  let startX = M;
  let R = measure(colW - cardPad * 2);
  let gov = Math.max(...R.meas.map(m => m.contentW));
  if (gov / colW < tk.threshold('fillRatio')) {
    colW = Math.min(colW, Math.ceil(gov) + cardPad * 2);
    R = measure(colW - cardPad * 2);
    gov = Math.max(...R.meas.map(m => m.contentW));
    startX = M + Math.round((CW - (cards.length * colW + (cards.length - 1) * colGap)) / 2);
  }
  const innerW = colW - cardPad * 2;
  const { bigSize, secondSize, meas } = R;
  doc.v.fillGroup('數據卡列', meas.map(m => m.contentW), colW);

  // 垂直帶槽(全列統一格線):每槽高度取全卡最大值,缺內容的卡留空槽——確保標題/圖示/大數字/底部
  // 跨卡水平對齊(並列卡各自置中會導致同類元素高度漂移,已實測)。全空的槽整列移除。
  const bigH = Math.round(tk.capHeight(bigSize) * 1.3);
  const slotDefs = [
    cards.map(c => c.title ? tk.lineHeight(T.cardTitle) : 0),
    cards.map(() => iconZone),
    cards.map(c => c.prefix ? tk.lineHeight(T.note) : 0),
    cards.map(() => bigH),
    meas.map(m => m.labelLines ? m.labelLines.length * tk.lineHeight(T.tile) : 0),
    meas.map(m => m.bottomH ? 1 : 0),          // 分隔線
    meas.map(m => m.bottomH),
  ];
  const slotKeys = ['title', 'icon', 'prefix', 'big', 'label', 'divider', 'bottom'];
  const slotList = slotDefs.map((a, j) => ({ key: slotKeys[j], h: Math.max(...a) })).filter(s => s.h > 0);
  const gapBase = doc.geo('gap.inlineSiblings');
  const natH = slotList.reduce((a, s) => a + s.h, 0);
  const gapN = slotList.length - 1;
  const flex = cardH - barH - padY * 2 - natH - gapBase * gapN;
  const gapExtra = Math.max(0, Math.min(34, gapN ? flex / gapN : 0));
  const step = gapBase + gapExtra;
  const topOffset = barH + padY + Math.max(0, (flex - gapExtra * gapN) / 2);

  doc.v.inside('數據卡列', box(startX, top, CW - (startX - M) * 2, cardH + (cclH ? cclH + gapBand : 0)),
               box(M, top, CW, bottomLimit - top), '內容區',
               `減少卡數或縮短文案;卡數現 ${cards.length}`);
  doc.v.verticalFill('數據卡列', cardH + (cclH ? cclH + gapBand : 0), bottomLimit - top);

  // ---------------------------------------------------------------- 卡片
  const cardBoxes = [];
  cards.forEach((c, i) => {
    const col = hueOf(c, i);
    const m = meas[i];
    const b = box(startX + i * (colW + colGap), top, colW, cardH);
    cardBoxes.push(b);
    doc.card(b, col);
    // 識別色線:卡頂圓角色帶(三段深色漸層,不平塗)
    doc.push(`<path d="M${b.x} ${b.y + barH}a${barH} ${barH} 0 0 1 ${barH} ${-barH}h${b.w - barH * 2}` +
             `a${barH} ${barH} 0 0 1 ${barH} ${barH}z" fill="url(#gHdr${col.key[0].toUpperCase()})"/>`);

    let y = b.y + topOffset;
    let last = b.y + barH;
    slotList.forEach(s => {
      switch (s.key) {
        case 'title':
          if (c.title) doc.text(c.title, b.cx, y + tk.capHeight(T.cardTitle) + (s.h - tk.lineHeight(T.cardTitle)) / 2, { size: T.cardTitle, weight: 800, fill: col.deep, anchor: 'middle' });
          break;
        case 'icon': {
          const icy = y + s.h / 2;
          if (!doc.asset(c.asset, b.cx, icy, assetSize)) {
            doc.push(`<circle cx="${b.cx}" cy="${icy}" r="${iconZone * 0.32}" fill="${col.light}" stroke="${col.main}" stroke-width="${tk.stroke('subCard')}" filter="url(#card2)"/>`);
            ic(c.icon, b.cx - iconZone * 0.17, icy - iconZone * 0.17, iconZone * 0.34, col.main);
          }
          break;
        }
        case 'prefix':
          if (c.prefix) doc.text(c.prefix, b.cx, y + tk.capHeight(T.note) + (s.h - tk.lineHeight(T.note)) / 2, { size: T.note, weight: 500, fill: ink.muted, anchor: 'middle' });
          break;
        case 'big': {
          const bx = b.cx - m.bigW / 2, by = y + tk.capHeight(bigSize) + (s.h - tk.capHeight(bigSize)) / 2;
          doc.text(String(c.value), bx, by, { size: bigSize, weight: 900, fill: col.main });
          if (c.unit) doc.text(c.unit, bx + tk.textWidth(String(c.value), bigSize) + unitGap, by, { size: unitSize, weight: 700, fill: col.main });
          break;
        }
        case 'label':
          if (m.labelLines) {
            let yy = y + (s.h - m.labelLines.length * tk.lineHeight(T.tile)) / 2;
            m.labelLines.forEach(ln => {
              yy += tk.lineHeight(T.tile);
              doc.text(ln, b.cx, yy - (tk.lineHeight(T.tile) - tk.capHeight(T.tile)) / 2, { size: T.tile, weight: 800, fill: col.deep, anchor: 'middle' });
            });
          }
          break;
        case 'divider':
          if (m.bottomH) doc.push(`<line x1="${b.x + cardPad}" y1="${y + s.h / 2}" x2="${b.right - cardPad}" y2="${y + s.h / 2}" stroke="${ink.line}" stroke-width="${tk.stroke('hairline')}"/>`);
          break;
        case 'bottom':
          if (m.descLines) {
            // 解釋行走內文級(非說明級):簡報遠距閱讀下 20px 偏小,依使用者回饋升為 body 22/500
            let yy = y + (s.h - m.descLines.length * tk.lineHeight(T.body)) / 2;
            m.descLines.forEach(ln => {
              yy += tk.lineHeight(T.body);
              doc.text(ln, b.cx, yy - (tk.lineHeight(T.body) - tk.capHeight(T.body)) / 2, { size: T.body, weight: 500, fill: ink.muted, anchor: 'middle' });
            });
          } else if (c.second) {
            const cyR = y + s.h / 2;
            let sx = b.cx - m.secondW / 2;
            ic('clock', sx, cyR - 13, 26, ink.reservedLine); sx += 26 + 8;
            if (c.second.prefix) { doc.text(c.second.prefix, sx, cyR + T.note * 0.36, { size: T.note, weight: 500, fill: ink.reservedText }); sx += tk.textWidth(c.second.prefix, T.note) + 8; }
            doc.text(String(c.second.value), sx, cyR + secondSize * 0.36, { size: secondSize, weight: 900, fill: ink.reservedText });
            sx += tk.textWidth(String(c.second.value), secondSize, 900) + 14;
            doc.text(c.second.label, sx, cyR + T.note * 0.36, { size: T.note, weight: 700, fill: ink.reservedText });
          }
          break;
      }
      if (s.key === 'bottom' ? m.bottomH : (s.key !== 'divider' || m.bottomH)) last = y + s.h;
      y += s.h + step;
    });
    doc.v.inside(`卡「${c.title || c.label || c.value}」內容`, box(b.x + cardPad, b.y + barH, innerW, last - b.y - barH), b, '數據卡',
                 '縮短解釋文案或減少卡數');
  });
  doc.v.noOverlap('數據卡', cardBoxes);

  // ---------------------------------------------------------------- 結論帶
  if (D.conclude) {
    const col = P.hue(D.conclude.color || 'blue');
    const cb = box(M, top + cardH + gapBand, CW, cclH);
    doc.push(`<rect x="${cb.x}" y="${cb.y + 6}" width="${cb.w}" height="${cb.h}" rx="14" fill="${col.main}" opacity="0.12"/>`);
    doc.roundRect(cb, { r: doc.geo('radius.band'), fill: '#FFFFFF', stroke: col.main, sw: tk.stroke('card'), filter: 'shadow' });
    const badge = 56, gapT = 26;
    const textW = doc.tw(D.conclude.text, T.conclude);
    const blockW = badge + gapT + textW;
    const kx = M + (CW - blockW) / 2;
    doc.push(`<rect x="${kx}" y="${cb.cy - badge / 2}" width="${badge}" height="${badge}" rx="14" fill="url(#s${col.key[0].toUpperCase() + col.key.slice(1)})" filter="url(#obj)"/>`);
    ic(D.conclude.icon || 'checkboard', kx + badge / 2 - 16, cb.cy - 16, 32, '#FFFFFF');
    const hi = D.conclude.hi || [];
    let rest = D.conclude.text, spans = '';
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    while (rest.length) {
      const mm = re && rest.match(re);
      if (!mm) { spans += `<tspan>${doc.esc(rest)}</tspan>`; break; }
      if (mm.index > 0) spans += `<tspan>${doc.esc(rest.slice(0, mm.index))}</tspan>`;
      spans += `<tspan fill="${col.main}" font-weight="900">${doc.esc(mm[1])}</tspan>`;
      rest = rest.slice(mm.index + mm[1].length);
    }
    doc.push(`<text x="${kx + badge + gapT}" y="${cb.cy + 13}" font-size="${T.conclude}" font-weight="800" fill="${ink.title}">${spans}</text>`);
    doc.v.inside('結論帶內容', box(kx, cb.y, blockW, cclH), cb, '結論帶', '縮短結論文案');
  }

  if (D.footnote) doc.text(D.footnote, M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.reservedText });
  if (D.page) doc.text(D.page, W - M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.reservedText, anchor: 'end' });
}

module.exports = { id, accepts, render };
