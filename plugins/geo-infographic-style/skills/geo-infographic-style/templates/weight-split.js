// [模板] 權重分流:頂部總量框 → 點虛線分流至 N 張分支卡(大數字 + 佔比條;可帶明細列與底部經費帶)
// → 右側預留/未編列狀態卡(灰時鐘 + 虛線框,§3)→ 結論帶。對應「呈現結構/層級 × 佔比數據」類頁面(如經費/權重配置)。
// 佔比條 = 分支值 ÷ 總量,數值已由大數字直標,條僅視覺比例;明細列左名稱+權重、右職責(左右撐滿)。
const { box, fitDisplay } = require('../scripts/engine');
const { icon } = require('../scripts/icons');
const tk = require('../scripts/tokens');

const id = 'weight-split';
const accepts = c => !!c.total && Array.isArray(c.branches) && c.branches.length >= 2 &&
                     !c.cards && !c.columns && !c.hub;

function render(doc, D) {
  const { P, T } = doc, ink = P.ink;
  const W = doc.W, H = doc.H, M = doc.m, CW = doc.contentW;
  const warn = (r, m, ref) => doc.v.warn(r, m, ref);
  const ic = (n, x, y, s, c, o = {}) => doc.push(icon(n, x, y, s, c, { warn, ...o }));
  const hueOf = (it, i) => (it.color && P.hue(it.color)) || (it.concept && P.forConcept(it.concept)) || P.hue(i);
  const isGeox = P.name === 'geox-navy';
  const L = k => ({ slate: 'N', gold: 'Y' }[k] || k[0].toUpperCase());
  const gradOf = k => (isGeox ? 'xHdr' : 'gHdr') + L(k);
  const bandOf = k => (isGeox ? 'xBand' : 'gBand') + L(k);
  const sphOf = k => isGeox ? 'xSph' + L(k) : 's' + k[0].toUpperCase() + k.slice(1);
  const hiLine = (line, hi, col) => {
    if (!hi || !hi.length) return `<tspan>${doc.esc(line)}</tspan>`;
    const re = new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
    let rest = line, out = '';
    while (rest.length) {
      const mm = rest.match(re);
      if (!mm) { out += `<tspan>${doc.esc(rest)}</tspan>`; break; }
      if (mm.index > 0) out += `<tspan>${doc.esc(rest.slice(0, mm.index))}</tspan>`;
      out += `<tspan fill="${col.main}" font-weight="900">${doc.esc(mm[1])}</tspan>`;
      rest = rest.slice(mm.index + mm[1].length);
    }
    return out;
  };

  doc.pageBg().decorBottom();

  // ---------------------------------------------------------------- L1 標題帶
  const ch = tk.chrome(doc.mode.name);
  let top = ch.contentTop;
  if (D.title) {
    const tb = doc.text(D.title, M, ch.titleBaseline, { size: T.title, weight: 900, fill: ink.title });
    if (D.subtitle) doc.text(D.subtitle, M, ch.subBaseline, { size: T.sub, weight: 500, fill: ink.muted });
    doc.decorTitleRight(tb.right);
  } else top = 40;

  // ---------------------------------------------------------------- 尺寸求解
  const cclH = D.conclude ? ch.concludeHeight : 0;
  const gapBand = doc.geo('gap.band');
  const bottomLimit = D.title ? ch.footBaseline - 24 : H - 30;
  const colGap = doc.geo('gap.col');
  const cardPad = doc.geo('padding.cardX');

  const totalH = 104, connH = 60;
  const branchTop = top + totalH + connH;
  const branchH = bottomLimit - branchTop - (cclH ? cclH + gapBand : 0);

  const totalCol = P.hue(D.total.color || 'blue');
  const branches = D.branches;
  const status = D.status || [];

  // 大數字:兩分支同字級
  const maxBig = Math.round(T.big * 1.2);
  const bigSize = Math.min(...branches.map(b => fitDisplay(String(b.value) + (b.unit || ''), maxBig, 340)));
  const bigW = b => tk.textWidth(String(b.value), bigSize) + (b.unit ? 4 + tk.textWidth(b.unit, T.bigUnit) : 0);

  // 寬度:狀態欄與分支A由內容決定,分支B(含明細列)取剩餘寬(明細列左右撐滿)
  const statusPad = 18;
  const statusW = status.length
    ? Math.max(...status.map(s => Math.max(tk.textWidth(s.label, T.sub),
        tk.textWidth(String(s.value), T.tile) + 10 + tk.textWidth(s.note || '', T.note)))) + statusPad * 2 + 34
    : 0;
  const bA = branches[0];
  const wA = Math.max(tk.textWidth(bA.title, T.cardTitle), bigW(bA), 300) + cardPad * 2;
  const wB = CW - wA - (statusW ? statusW + colGap : 0) - colGap;

  // 總量框:內容驅動寬,置中
  const totalBig = fitDisplay(String(D.total.value) + (D.total.unit || ''), 64, 240);
  const wT = tk.textWidth(D.total.label, T.cardTitle) + 24 + tk.textWidth(String(D.total.value), totalBig) +
             (D.total.unit ? 4 + tk.textWidth(D.total.unit, T.bigUnit) : 0) + cardPad * 2;
  const xT = M + (CW - wT) / 2;

  // ---------------------------------------------------------------- 總量框 + 分流線
  const tb2 = box(xT, top, wT, totalH);
  doc.push(`<rect x="${tb2.x}" y="${tb2.y + 6}" width="${tb2.w}" height="${tb2.h}" rx="16" fill="${totalCol.main}" opacity="0.14"/>`);
  doc.roundRect(tb2, { r: 16, fill: `url(#${bandOf(totalCol.key)})`, stroke: totalCol.main, sw: tk.stroke('card'), filter: 'shadow' });
  let tx = tb2.x + cardPad;
  doc.text(D.total.label, tx, tb2.cy + T.cardTitle * 0.36, { size: T.cardTitle, weight: 800, fill: ink.title });
  tx += tk.textWidth(D.total.label, T.cardTitle) + 24;
  doc.text(String(D.total.value), tx, tb2.cy + totalBig * 0.36, { size: totalBig, weight: 900, fill: totalCol.main });
  if (D.total.unit) doc.text(D.total.unit, tx + tk.textWidth(String(D.total.value), totalBig) + 4, tb2.cy + totalBig * 0.36, { size: T.bigUnit, weight: 700, fill: totalCol.main });
  doc.v.inside('總量框內容', box(tb2.x + cardPad, tb2.y, wT - cardPad * 2, totalH), tb2, '總量框');

  const xA = M, xB = M + wA + colGap;
  const centers = [xA + wA / 2, xB + wB / 2];
  const yMid = top + totalH + connH / 2;
  const dash = doc.geo('connector.radialDash'), dw = doc.geo('connector.radialWidth');
  centers.forEach((cx2, i) => {
    const col = hueOf(branches[i], i);
    doc.push(`<path d="M${tb2.cx} ${tb2.bottom + 6}V${yMid}H${cx2}V${branchTop - 10}" fill="none" stroke="#9AA7C8" stroke-width="${dw}" stroke-dasharray="${dash}" stroke-linecap="round"/>`);
    doc.push(`<circle cx="${cx2}" cy="${branchTop - 8}" r="5.5" fill="${col.main}"/>`);
  });
  doc.push(`<circle cx="${tb2.cx}" cy="${tb2.bottom + 6}" r="5.5" fill="${totalCol.deep}"/>`);

  // ---------------------------------------------------------------- 分支卡
  const allBoxes = [tb2];
  const drawBig = (b2, col, cx2, y) => {
    const w = bigW(b2);
    const bx = cx2 - w / 2;
    doc.text(String(b2.value), bx, y, { size: bigSize, weight: 900, fill: col.main });
    if (b2.unit) doc.text(b2.unit, bx + tk.textWidth(String(b2.value), bigSize) + 4, y, { size: T.bigUnit, weight: 700, fill: col.main });
  };
  const drawBar = (col, cx2, y, w, frac) => {
    doc.push(`<rect x="${cx2 - w / 2}" y="${y}" width="${w}" height="14" rx="7" fill="${ink.neutralData}"/>`);
    doc.push(`<rect x="${cx2 - w / 2}" y="${y}" width="${Math.max(14, Math.round(w * frac))}" height="14" rx="7" fill="url(#${gradOf(col.key)})"/>`);
  };
  const totalVal = parseFloat(D.total.value);

  // 分支 A(僅大數字;內容少於 3 條 → 圖示補位,§3 不載資訊)
  {
    const col = hueOf(bA, 0);
    const b2 = box(xA, branchTop, wA, branchH);
    allBoxes.push(b2);
    doc.card(b2, col);
    // 圖示補位帶(§3):球面漸層徽章 + 白圖示(與結論帶徽章同質感),依剩餘空間放大以撐垂直填充
    const fixedH = tk.lineHeight(T.cardTitle) + 20 + Math.round(bigSize * 1.1) + 18 + 14 + 34;
    const iconZone = Math.max(150, Math.min(260, branchH - fixedH - 72));
    const nat = fixedH + iconZone;
    let y = b2.y + Math.max(24, (branchH - nat) / 2);
    doc.text(bA.title, b2.cx, y + tk.capHeight(T.cardTitle), { size: T.cardTitle, weight: 800, fill: col.deep, anchor: 'middle' });
    y += tk.lineHeight(T.cardTitle) + 20;
    drawBig(bA, col, b2.cx, y + Math.round(bigSize * 0.88));
    y += Math.round(bigSize * 1.1) + 18;
    drawBar(col, b2.cx, y, wA - cardPad * 2, parseFloat(bA.value) / totalVal);
    y += 14 + 34;
    const icy = y + iconZone / 2, br = iconZone * 0.42;
    doc.push(`<circle cx="${b2.cx}" cy="${icy}" r="${br}" fill="url(#${sphOf(col.key)})" filter="url(#obj)"/>`);
    ic(bA.icon || 'gearpeople', b2.cx - br * 0.52, icy - br * 0.52, br * 1.04, '#FFFFFF');
    doc.v.inside(`分支「${bA.title}」內容`, box(b2.x + cardPad, b2.y + 20, wA - cardPad * 2, y + iconZone - b2.y - 20), b2, '分支卡');
  }

  // 分支 B(大數字 + 明細列 + 底部經費帶)
  {
    const bB = branches[1];
    const col = hueOf(bB, 1);
    const b2 = box(xB, branchTop, wB, branchH);
    allBoxes.push(b2);
    doc.card(b2, col);
    const innerW2 = wB - cardPad * 2;
    const rows = bB.rows || [];
    const rowH = 52, rowGap = doc.geo('gap.row');
    const footH2 = bB.footer ? 54 : 0;
    const nat = tk.lineHeight(T.cardTitle) + 20 + Math.round(bigSize * 1.1) + 18 + 14 + 26 +
                rows.length * (rowH + rowGap) + (footH2 ? footH2 + 14 : 0);
    const extra = Math.max(0, (branchH - nat - 48) / (rows.length + 3));
    let y = b2.y + 24 + extra / 2;
    doc.text(bB.title, b2.cx, y + tk.capHeight(T.cardTitle), { size: T.cardTitle, weight: 800, fill: col.deep, anchor: 'middle' });
    y += tk.lineHeight(T.cardTitle) + 20 + extra;
    drawBig(bB, col, b2.cx, y + Math.round(bigSize * 0.88));
    y += Math.round(bigSize * 1.1) + 18;
    drawBar(col, b2.cx, y, innerW2, parseFloat(bB.value) / totalVal);
    y += 14 + 26 + extra;
    rows.forEach(r => {
      doc.push(`<g filter="url(#row)"><rect x="${b2.x + cardPad}" y="${y}" width="${innerW2}" height="${rowH}" rx="10" fill="#FFFFFF" stroke="${col.edge}" stroke-width="${tk.stroke('subCard')}"/></g>`);
      const cyR = y + rowH / 2;
      let rx = b2.x + cardPad + 18;
      doc.text(r.name, rx, cyR + T.subCard * 0.36, { size: T.subCard, weight: 700, fill: ink.body });
      rx += tk.textWidth(r.name, T.subCard, 700) + 16;
      doc.text(String(r.value) + (r.unit || '%'), rx, cyR + T.subCard * 0.36, { size: T.subCard, weight: 900, fill: col.main });
      if (r.duty) doc.text(r.duty, b2.right - cardPad - 18, cyR + T.note * 0.36, { size: T.note, weight: 500, fill: ink.muted, anchor: 'end' });
      y += rowH + rowGap + extra;
    });
    if (bB.footer) {
      y += 14 - rowGap;
      doc.push(`<rect x="${b2.x + cardPad}" y="${y}" width="${innerW2}" height="${footH2}" rx="12" fill="${col.light}" stroke="${col.edge}" stroke-width="${tk.stroke('hairline')}"/>`);
      const ftW = tk.textWidth(bB.footer.label, T.sub) + 10 + tk.textWidth(bB.footer.value, T.tile);
      let fx = b2.cx - ftW / 2;
      doc.text(bB.footer.label, fx, y + footH2 / 2 + T.sub * 0.36, { size: T.sub, weight: 700, fill: ink.body });
      fx += tk.textWidth(bB.footer.label, T.sub) + 10;
      doc.text(bB.footer.value, fx, y + footH2 / 2 + T.tile * 0.36, { size: T.tile, weight: 900, fill: col.main });
      y += footH2;
    }
    doc.v.inside(`分支「${bB.title}」內容`, box(b2.x + cardPad, b2.y + 20, innerW2, y - b2.y - 20), b2, '分支卡', '縮短明細列或拆頁');
  }

  // ---------------------------------------------------------------- 狀態卡(預留/未編列:虛線框 + 灰時鐘,§3)
  if (status.length) {
    const xS = M + CW - statusW;
    const sH = 132, sGap = 16;
    const stackH = status.length * sH + (status.length - 1) * sGap;
    let sy = branchTop + (branchH - stackH) / 2;
    status.forEach(s => {
      const sb = box(xS, sy, statusW, sH);
      allBoxes.push(sb);
      doc.push(`<rect x="${sb.x}" y="${sb.y}" width="${sb.w}" height="${sb.h}" rx="12" fill="#FFFFFF" stroke="${ink.reservedLine}" stroke-width="${tk.stroke('subCard')}" stroke-dasharray="8 6" filter="url(#row)"/>`);
      ic('clock', sb.x + statusPad, sb.y + 18, 26, ink.reservedLine);
      doc.text(s.label, sb.x + statusPad + 36, sb.y + 18 + 20, { size: T.sub, weight: 700, fill: ink.reservedText });
      doc.text(String(s.value), sb.x + statusPad, sb.y + sH - 26, { size: T.tile, weight: 900, fill: ink.reservedText });
      if (s.note) doc.text(s.note, sb.x + statusPad + tk.textWidth(String(s.value), T.tile, 900) + 12, sb.y + sH - 26, { size: T.note, weight: 500, fill: ink.reservedText });
      sy += sH + sGap;
    });
  }
  doc.v.noOverlap('權重分流區塊', allBoxes);
  doc.v.verticalFill('權重分流', totalH + connH + branchH + (cclH ? cclH + gapBand : 0), bottomLimit - top);

  // ---------------------------------------------------------------- 結論帶
  if (D.conclude) {
    const col = P.hue(D.conclude.color || 'blue');
    const cb = box(M, branchTop + branchH + gapBand, CW, cclH);
    doc.push(`<rect x="${cb.x}" y="${cb.y + 6}" width="${cb.w}" height="${cb.h}" rx="14" fill="${col.main}" opacity="0.12"/>`);
    doc.roundRect(cb, { r: doc.geo('radius.band'), fill: '#FFFFFF', stroke: col.main, sw: tk.stroke('card'), filter: 'shadow' });
    const badge = 56, gapT = 26;
    const textW = doc.tw(D.conclude.text, T.conclude);
    const blockW = badge + gapT + textW;
    const kx = M + (CW - blockW) / 2;
    doc.push(`<rect x="${kx}" y="${cb.cy - badge / 2}" width="${badge}" height="${badge}" rx="14" fill="url(#${sphOf(col.key)})" filter="url(#obj)"/>`);
    ic(D.conclude.icon || 'checkboard', kx + badge / 2 - 16, cb.cy - 16, 32, '#FFFFFF');
    doc.push(`<text x="${kx + badge + gapT}" y="${cb.cy + 13}" font-size="${T.conclude}" font-weight="800" fill="${ink.title}">${hiLine(D.conclude.text, D.conclude.hi, col)}</text>`);
    doc.v.inside('結論帶內容', box(kx, cb.y, blockW, cclH), cb, '結論帶', '縮短結論文案');
  }

  if (D.footnote) doc.text(D.footnote, M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.reservedText });
  if (D.page) doc.text(D.page, W - M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.reservedText, anchor: 'end' });
}

module.exports = { id, accepts, render };
