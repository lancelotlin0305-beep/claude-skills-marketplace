// [模板] 族③ 資料匯流:來源系統 → 中央 hub → 決策層 → 模組群 → 共通能力帶 → 結論帶。
// 本檔只宣告「有哪些帶、每帶有哪些項」;所有尺寸與座標由 engine 依內容求解,並由 validator 驗收。
// 元素數量全部可變:來源 n、hub 列 n、階段 n、模組 n、能力項 n。
const { box, grid, stackV, fitDisplay } = require('../scripts/engine');
const { icon } = require('../scripts/icons');
const tk = require('../scripts/tokens');

const id = 'hub-flow';
const accepts = c => c.hub && Array.isArray(c.modules) && c.modules.length > 0;

function render(doc, D) {
  const { P, T } = doc, ink = P.ink, sig = P.signature;
  const W = doc.W, H = doc.H, M = doc.m, CW = doc.contentW;
  const warn = (r, m, ref) => doc.v.warn(r, m, ref);
  const ic = (n, x, y, s, c, o = {}) => doc.push(icon(n, x, y, s, c, { warn, ...o }));

  // 群組配色:優先用概念綁定(跨頁一致),否則依序輪色(超過色數自動循環)
  const hueOf = (item, i) => (item.concept && P.forConcept(item.concept)) || P.hue(i);

  // ---------------------------------------------------------------- L0 底圖(引擎共用)
  doc.pageBg().decorBottom();

  // ---------------------------------------------------------------- L1 標題帶

  const ch = tk.chrome('16x9');
  const titleBox = doc.text(D.title, M, ch.titleBaseline, { size: T.title, weight: 900, fill: ink.title });
  if (D.subtitle) doc.text(D.subtitle, M, ch.subBaseline, { size: T.sub, weight: 500, fill: ink.sub });
  doc.decorTitleRight(titleBox.right);

  // ---------------------------------------------------------------- 各帶高度(由內容回推)
  // hub 圓柱:膠囊寬由最長標籤決定 → 柱半徑由膠囊寬回推 → 柱高由列數回推
  const CY = tk.RAW.geometry.cylinder;
  const pillPad = 24, pillIcon = 42, pillGapX = 16;
  const hubRows = D.hub.rows || [];
  const pillTextW = Math.max(...hubRows.map(r => doc.tw(r.label, T.cardTitle)), 0);
  const pillW = pillPad * 2 + pillIcon + pillGapX + pillTextW;
  const cylRx = Math.round(pillW / CY.pillWidthRatioOfBody / 2);
  const cylRy = Math.round(cylRx * CY.ryRatio);
  const stackH = hubRows.length * CY.pillHeight + Math.max(0, hubRows.length - 1) * CY.pillGap;
  const cylBodyH = stackH + 28;

  // 來源磚:寬由「圖示或代號」決定
  const tileIcon = 80, tilePad = 28;
  const srcs = D.sources || [];
  const tileW = Math.round(Math.max(tileIcon, ...srcs.map(s => doc.tw(s.code, T.tile) + 2)) + tilePad * 2);
  const tileH = 176;

  // 階段卡:寬由「徽章 + 最長文字」決定
  const stBadge = 104, stPad = 24, stGap = 18;
  const stages = (D.stages || []).map(s => {
    const tw = Math.max(doc.tw(s.title, T.cardTitle), s.sub ? doc.tw(s.sub, T.sub) : 0);
    return { ...s, w: Math.round(stBadge + stGap + tw + stPad * 2) };
  });
  const stageH = 210;

  const rowH = Math.max(tileH, stageH, cylBodyH + cylRy + 40);

  // 模組卡:高度由「徽章」與「文字行數」較大者決定
  // 等寬欄的欄寬須「取到最小」(§3.1 例外①):先以全寬等分求出斷行,再把欄寬收到實際最長行,
  // 最後把整列置中。直接用全寬等分會讓每張卡固定空掉約 30%(validator 會擋)。
  const modBadge = 120, modPad = 20, modGap = 14;
  const mods = D.modules || [];
  const colGap = doc.geo('gap.col');
  const maxColW = (CW - (mods.length - 1) * colGap) / Math.max(1, mods.length);
  const wrapW = maxColW - modPad * 2 - modBadge - modGap;
  const modLines = mods.map(m => m.lines || tk.wrapBalanced(m.name, T.cardTitle, wrapW));
  const modTextW = Math.max(...modLines.flat().map(l => doc.tw(l, T.cardTitle)), 0);
  const modW = Math.round(modBadge + modGap + modTextW + modPad * 2);
  const modSpan = mods.length * modW + (mods.length - 1) * colGap;
  const modGapX = mods.length > 1 ? colGap + Math.max(0, (CW - modSpan) / (mods.length - 1)) : 0;
  const modCols = mods.map((_, i) => box(M + i * (modW + modGapX), 0, modW, 0));
  const maxModLines = Math.max(...modLines.map(l => l.length), 1);
  const modH = Math.max(modBadge + 32, maxModLines * tk.lineHeight(T.cardTitle) + 56);

  // 共通能力帶
  const capIcon = 64, capPad = 18;
  const caps = D.capabilities || [];
  const capH = capIcon + 32;

  const cclH = tk.RAW.pageChrome['16x9'].concludeHeight;
  const gapBand = doc.geo('gap.band');

  // ---------------------------------------------------------------- 垂直堆疊求解
  const leadH = D.lead ? tk.lineHeight(T.lead) : 0;
  const gaps = [8, 0, 0, gapBand, gapBand];
  const gapSum = gaps.reduce((a, b) => a + b, 0);
  const avail = (ch.footBaseline - 24) - ch.contentTop;
  // 曲線區吃剩餘空間:其餘各帶高度都由內容決定,只有連線區可伸縮。
  const CURVE_MIN = 64;
  const curveH = avail - (leadH + rowH + modH + capH + cclH + gapSum);
  if (curveH < CURVE_MIN) {
    doc.v.inside('內容總高', box(M, ch.contentTop, CW, avail + (CURVE_MIN - curveH)),
                 box(M, ch.contentTop, CW, avail), '內容區',
                 `本頁內容超載。依 §10 應拆頁,或減少 hub 列(現 ${hubRows.length})、模組(現 ${mods.length})、階段(現 ${stages.length})`);
  }
  const heights = [leadH, rowH, Math.max(CURVE_MIN, curveH), modH, capH, cclH];
  let y = ch.contentTop, ys = [];
  heights.forEach((h, i) => { ys.push(y); y += h + (gaps[i] ?? 0); });
  const [yLead, yRow, yCurve, yMod, yCap, yCcl] = ys;

  // ---------------------------------------------------------------- 主流程列(水平求解)
  const laneW = doc.geo('gap.arrowLane');
  const srcBlockW = srcs.length * tileW;                    // 磚間距稍後由剩餘空間補
  const stagesW = stages.reduce((a, s) => a + s.w, 0);
  const hubBlockW = cylRx * 2 + 24;
  const nLanes = 1 + stages.length;                          // 來源→hub,hub→階段,階段之間
  const fixed = srcBlockW + hubBlockW + stagesW + nLanes * laneW;
  const slack = CW - fixed;
  if (slack < 0) doc.v.inside('主流程列', box(M, yRow, fixed, rowH), box(M, yRow, CW, rowH), '安全區',
    `橫向塞不下:來源 ${srcs.length} + hub + 階段 ${stages.length};請減少階段數或縮短階段標題`);
  const srcGap = srcs.length > 1 ? Math.max(16, slack * 0.55 / (srcs.length - 1)) : 0;
  const extraLane = stages.length ? (slack - srcGap * Math.max(0, srcs.length - 1)) / nLanes : 0;
  const lane = laneW + Math.max(0, extraLane);

  let cx = M;
  const srcBoxes = srcs.map((s, i) => { const b = box(cx, yRow, tileW, tileH); cx += tileW + (i < srcs.length - 1 ? srcGap : 0); return b; });
  cx += lane;
  const hubBox = box(cx, yRow, hubBlockW, rowH); cx += hubBlockW + lane;
  const stageBoxes = stages.map((s, i) => { const b = box(cx, yRow, s.w, stageH); cx += s.w + (i < stages.length - 1 ? lane : 0); return b; });
  doc.v.inside('主流程列右緣', box(M, yRow, cx - M, rowH), box(M, yRow, CW, rowH), '安全區');
  doc.v.noOverlap('主流程列元件', [...srcBoxes, hubBox, ...stageBoxes]);

  // --- 來源磚(平台先畫,磚壓在上面) ---
  const srcSpan = srcBoxes.length ? srcBoxes[srcBoxes.length - 1].right - srcBoxes[0].x : 0;
  if (srcBoxes.length) glowPad(srcBoxes[0].x + srcSpan / 2, yRow + tileH + 24, srcSpan / 2 + 26, 26);
  srcBoxes.forEach((b, i) => {
    doc.push(`<rect x="${b.x}" y="${b.y + 6}" width="${b.w}" height="${b.h}" rx="16" fill="#0E2A5C" opacity="0.16"/>`);
    doc.roundRect(b, { r: 16, fill: 'url(#xTile)', filter: 'shadow' });
    doc.push(`<rect x="${b.x + 3}" y="${b.y + 3}" width="${b.w - 6}" height="${b.h * 0.42}" rx="13" fill="url(#xGloss)"/>`);
    doc.push(`<rect x="${b.x + 0.75}" y="${b.y + 0.75}" width="${b.w - 1.5}" height="${b.h - 1.5}" rx="15.3" fill="none" stroke="${sig.cyan}" stroke-width="1.5" opacity="0.45"/>`);
    ic(srcs[i].icon, b.cx - tileIcon / 2, b.y + 26, tileIcon, '#FFFFFF');
    const t = doc.text(srcs[i].code, b.cx, b.bottom - 26, { size: T.tile, weight: 800, fill: '#FFFFFF', anchor: 'middle', ls: 1 });
    doc.v.inside(`磚「${srcs[i].code}」文字`, t, b.inset(8), '磚');
  });

  // --- 箭頭 ---
  const arrowAt = (x, cy) => {
    const a = tk.RAW.geometry.arrow, bw = a.len - a.head;
    doc.push(`<g filter="url(#hdr)"><path d="M${x} ${cy - a.shaft / 2}h${bw}v-7l${a.head} ${a.shaft / 2 + 7}l${-a.head} ${a.shaft / 2 + 7}v-7h${-bw}z" fill="url(#xHdrB)"/></g>`);
  };
  const rowCy = yRow + Math.min(tileH, stageH) / 2;
  if (srcBoxes.length) arrowAt(srcBoxes[srcBoxes.length - 1].right + (lane - tk.RAW.geometry.arrow.len) / 2, rowCy);
  stageBoxes.forEach((b, i) => arrowAt(b.x - (lane + tk.RAW.geometry.arrow.len) / 2, rowCy));

  // --- hub 圓柱 + 多層台座 + 貼標膠囊 ---
  const hcx = hubBox.cx, cylTop = yRow + 16;
  const padCy = cylTop + cylBodyH + 30;
  function glowPad(x, y2, rx, ry) {
    doc.push(`<g><ellipse cx="${x}" cy="${y2}" rx="${rx}" ry="${ry}" fill="url(#xGlowPad)"/>
      <ellipse cx="${x}" cy="${y2}" rx="${rx * 0.72}" ry="${ry * 0.72}" fill="none" stroke="${sig.cyan}" stroke-width="1.6" opacity="0.3"/></g>`);
  }
  function tier(x, y2, rx, ry, t) {
    doc.push(`<g><path d="M${x - rx} ${y2} v${t} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-t} z" fill="url(#xTierSide)"/>
      <ellipse cx="${x}" cy="${y2}" rx="${rx}" ry="${ry}" fill="url(#xTierTop)"/>
      <ellipse cx="${x}" cy="${y2}" rx="${rx}" ry="${ry}" fill="none" stroke="${sig.cyan}" stroke-width="1.8" opacity="0.55"/></g>`);
  }
  const ped = tk.RAW.geometry.pedestal.tiers;
  glowPad(hcx, padCy + 12, cylRx * 1.74, 34);
  tier(hcx, padCy, Math.round(cylRx * 1.48), 28, 12);
  tier(hcx, padCy - 12, Math.round(cylRx * 1.2), 24, 10);
  doc.push(`<g filter="url(#shadow)">
    <path d="M${hcx - cylRx} ${cylTop} v${cylBodyH} a${cylRx} ${cylRy} 0 0 0 ${cylRx * 2} 0 v${-cylBodyH}z" fill="url(#xCylBody)"/>
    <ellipse cx="${hcx}" cy="${cylTop + cylBodyH}" rx="${cylRx}" ry="${cylRy}" fill="#0A2047" opacity="0.55"/>
    <ellipse cx="${hcx}" cy="${cylTop}" rx="${cylRx}" ry="${cylRy}" fill="url(#xCylTop)"/>
    <ellipse cx="${hcx}" cy="${cylTop}" rx="${cylRx}" ry="${cylRy}" fill="none" stroke="${sig.cyan}" stroke-width="1.6" opacity="0.6"/>
    <path d="M${hcx - cylRx} ${cylTop} v${cylBodyH}" stroke="${sig.cyan}" stroke-width="2" opacity="0.5" fill="none"/>
    <path d="M${hcx + cylRx} ${cylTop} v${cylBodyH}" stroke="${sig.cyan}" stroke-width="2" opacity="0.5" fill="none"/></g>`);
  const cylInner = box(hcx - cylRx, cylTop, cylRx * 2, cylBodyH).inset(14, 0);
  let py = cylTop + (cylBodyH - stackH) / 2;
  const pillBoxes = [];
  hubRows.forEach(r => {
    const b = box(hcx - pillW / 2, py, pillW, CY.pillHeight);
    pillBoxes.push(b);
    doc.push(`<g filter="url(#row)">
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${CY.pillRadius}" fill="#0B2650" opacity="0.82"/>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${CY.pillRadius}" fill="none" stroke="${sig.cyan}" stroke-width="1.2" opacity="0.5"/>
      <circle cx="${b.x + pillPad + pillIcon / 2}" cy="${b.cy}" r="${pillIcon / 2}" fill="url(#xSphB)"/></g>`);
    ic(r.icon, b.x + pillPad + pillIcon / 2 - 12, b.cy - 12, 24, '#FFFFFF');
    doc.text(r.label, b.x + pillPad + pillIcon + pillGapX, b.cy + 9, { size: T.cardTitle, weight: 700, fill: '#FFFFFF' });
    py += CY.pillHeight + CY.pillGap;
  });
  if (pillBoxes.length) {
    doc.v.inside('hub 膠囊堆疊', box(hcx - pillW / 2, pillBoxes[0].y, pillW, stackH), cylInner, '柱身');
    doc.v.fill('hub 膠囊', pillPad + pillIcon + pillGapX + pillTextW + pillPad, pillW);
  }
  // 貼標膠囊:壓在柱頂(§3.1 貼標例外),畫在圓柱之後
  const bw = doc.tw(D.hub.badge, T.tile) + 52, bh = 44, byy = cylTop - bh;
  doc.push(`<g filter="url(#hdr)"><rect x="${hcx - bw / 2}" y="${byy}" width="${bw}" height="${bh}" rx="22" fill="url(#xHdrO)"/></g>`);
  doc.text(D.hub.badge, hcx, byy + 30, { size: T.tile, weight: 800, fill: '#FFFFFF', anchor: 'middle' });
  if (pillBoxes.length) doc.v.clearance('貼標↔第一條膠囊', box(hcx - bw / 2, byy, bw, bh), pillBoxes[0], 12, '§3.1 貼標例外');

  // --- 導言句(與貼標同一水平帶) ---
  if (D.lead) {
    const lt = doc.text(D.lead, M, yLead + T.lead * 0.86, { size: T.lead, weight: 800, fill: ink.title });
    // 導言句是內容不是貼標,不得越界到磚列(§3.1 只有貼標可重疊)
    srcBoxes.forEach((b, i) => doc.v.clearance('導言句↔磚' + (i + 1), lt, b, 8, '§3.1'));
  }

  // --- 階段卡 ---
  stageBoxes.forEach((b, i) => {
    const s = stages[i], dark = s.tone === 'dark';
    doc.push(`<rect x="${b.x}" y="${b.y + 6}" width="${b.w}" height="${b.h}" rx="16" fill="${dark ? '#0E2A5C' : P.hue('blue').main}" opacity="0.16"/>`);
    if (dark) {
      doc.roundRect(b, { r: 16, fill: 'url(#xTile)', filter: 'shadow' });
      doc.push(`<rect x="${b.x + 3}" y="${b.y + 3}" width="${b.w - 6}" height="${b.h * 0.4}" rx="13" fill="url(#xGloss)"/>`);
    } else doc.roundRect(b, { r: 16, fill: 'url(#xBandB)', stroke: P.hue('blue').main, sw: 2, filter: 'shadow' });
    badge(b.x + stPad + stBadge / 2, b.cy, stBadge, P.hue('blue'), s.icon);
    const tx = b.x + stPad + stBadge + stGap, inkc = dark ? '#FFFFFF' : ink.title;
    const lines = s.lines || tk.wrapBalanced(s.title, T.cardTitle, b.right - stPad - tx);
    const blockH = lines.length * tk.lineHeight(T.cardTitle) + (s.sub ? tk.lineHeight(T.sub) : 0);
    let ty = b.cy - blockH / 2 + T.cardTitle * 0.8;
    lines.forEach(ln => { doc.text(ln, tx, ty, { size: T.cardTitle, weight: 800, fill: inkc }); ty += tk.lineHeight(T.cardTitle); });
    if (s.sub) doc.text(s.sub, tx, ty, { size: T.sub, weight: 500, fill: dark ? '#C9DCF5' : ink.muted });
    const used = stBadge + stGap + Math.max(...lines.map(l => doc.tw(l, T.cardTitle)), s.sub ? doc.tw(s.sub, T.sub) : 0);
    doc.v.fill(`階段卡「${s.title}」`, used + stPad * 2, b.w);
  });

  // --- 發光匯流曲線 + 模組卡 ---
  const sy = padCy + 32;
  modCols.forEach((c, i) => {
    const ex = c.cx;
    doc.push(`<path d="M${hcx} ${sy} C ${hcx} ${sy + 62}, ${ex} ${yMod - 76}, ${ex} ${yMod}" fill="none" stroke="${sig.flow}" stroke-width="${tk.RAW.geometry.connector.flowWidth}" opacity="0.9" filter="url(#glow)"/>`);
    doc.push(`<circle cx="${ex}" cy="${yMod}" r="${tk.RAW.geometry.connector.dotRadius}" fill="${sig.flow}"/>`);
  });
  doc.push(`<circle cx="${hcx}" cy="${sy}" r="5.5" fill="${sig.flow}" filter="url(#glow)"/>`);

  const modContentW = [];
  const bandKey = { blue: 'xBandB', green: 'xBandG', orange: 'xBandO', purple: 'xBandP', teal: 'xBandT', red: 'xBandR' };
  modCols.forEach((c, i) => {
    const col = hueOf(mods[i], i), b = box(c.x, yMod, c.w, modH);
    doc.push(`<rect x="${b.x}" y="${b.y + 6}" width="${b.w}" height="${b.h}" rx="14" fill="${col.main}" opacity="0.16"/>`);
    doc.roundRect(b, { r: 14, fill: `url(#${bandKey[col.key] || 'xBandB'})`, stroke: col.main, sw: 2, filter: 'shadow' });
    const lines = modLines[i];
    const textW = Math.max(...lines.map(l => doc.tw(l, T.cardTitle)));
    const blockW = modBadge + modGap + textW;
    const bx = b.x + (b.w - blockW) / 2;
    badge(bx + modBadge / 2, b.cy, modBadge, col, mods[i].icon);
    let ty = b.cy - (lines.length * tk.lineHeight(T.cardTitle)) / 2 + T.cardTitle * 0.85;
    lines.forEach(ln => { doc.text(ln, bx + modBadge + modGap, ty, { size: T.cardTitle, weight: 800, fill: col.deep }); ty += tk.lineHeight(T.cardTitle); });
    doc.v.inside(`模組卡${i + 1}`, b, doc.safe, '安全區');
    modContentW.push(blockW);
  });

  doc.v.fillGroup('模組卡列', modContentW, modW);

  // --- 共通能力帶(分佈帶:項目內容驅動、等距分佈) ---
  if (caps.length) {
    const capBox = box(M, yCap, CW, capH);
    doc.roundRect(capBox, { r: 14, fill: '#FFFFFF', stroke: ink.line, sw: 1.5, filter: 'card2' });
    const cell = CW / caps.length;
    let usedTotal = 0;
    caps.forEach((c, i) => {
      const textW = doc.tw(c.text, T.tile), blockW = capIcon + capPad + textW;
      usedTotal += blockW;
      const bx = M + i * cell + (cell - blockW) / 2;
      if (i > 0) doc.push(`<line x1="${M + i * cell}" y1="${yCap + 16}" x2="${M + i * cell}" y2="${yCap + capH - 16}" stroke="${ink.line}" stroke-width="1"/>`);
      doc.push(`<circle cx="${bx + capIcon / 2}" cy="${capBox.cy}" r="${capIcon / 2}" fill="url(#xSphB)" filter="url(#row)"/>`);
      ic(c.icon, bx + capIcon / 2 - 19, capBox.cy - 19, 38, '#FFFFFF');
      doc.text(c.text, bx + capIcon + capPad, capBox.cy + 9, { size: T.tile, weight: 600, fill: ink.body });
    });
    doc.v.fill('共通能力帶', usedTotal, CW, 'band');
  }

  // --- L5 結論帶 ---
  if (D.conclude) {
    const cb = box(M, yCcl, CW, cclH);
    doc.roundRect(cb, { r: 14, fill: 'url(#xConclude)', filter: 'shadow' });
    const badgeR = 26, gapT = 40;
    const textW = doc.tw(D.conclude.text, T.conclude);
    const blockW = badgeR * 2 + gapT + textW;
    const kx = M + (CW - blockW) / 2;
    doc.push(`<circle cx="${kx + badgeR}" cy="${cb.cy}" r="${badgeR}" fill="url(#xSphB)"/>`);
    ic(D.conclude.icon || 'bulb', kx + badgeR - 15, cb.cy - 15, 30, '#FFFFFF');
    const hi = D.conclude.hi || [];
    let rest = D.conclude.text, spans = '';
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    while (rest.length) {
      const m = re && rest.match(re);
      if (!m) { spans += `<tspan>${doc.esc(rest)}</tspan>`; break; }
      if (m.index > 0) spans += `<tspan>${doc.esc(rest.slice(0, m.index))}</tspan>`;
      spans += `<tspan fill="${sig.highlight.cyan}">${doc.esc(m[1])}</tspan>`;
      rest = rest.slice(m.index + m[1].length);
    }
    doc.push(`<text x="${kx + badgeR * 2 + gapT}" y="${cb.cy + 14}" font-size="${T.conclude}" font-weight="800" fill="#FFFFFF">${spans}</text>`);
    doc.v.inside('結論帶內容', box(kx, cb.y, blockW, cclH), cb, '結論帶');
  }

  // --- 註腳 ---
  if (D.footnote) doc.text(D.footnote, M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.faint });
  if (D.page) doc.text(D.page, W - M, ch.footBaseline, { size: T.foot, weight: 400, fill: ink.faint, anchor: 'end' });

  // 擬 3D 徽章(level 2);level 3 由 assets 覆寫
  function badge(cx2, cy2, size, col, iconName) {
    const r = size / 2, k = size * 0.28;
    doc.push(`<ellipse cx="${cx2}" cy="${cy2 + r + 6}" rx="${r * 0.86}" ry="${r * 0.17}" fill="${col.deep}" opacity="0.13"/>
      <rect x="${cx2 - r}" y="${cy2 - r}" width="${size}" height="${size}" rx="${k}" fill="url(#${'xSph' + col.key[0].toUpperCase()})" filter="url(#obj)"/>
      <rect x="${cx2 - r + 3}" y="${cy2 - r + 3}" width="${size - 6}" height="${(size - 6) * 0.46}" rx="${k * 0.8}" fill="url(#xGloss)"/>`);
    ic(iconName, cx2 - size * 0.29, cy2 - size * 0.29, size * 0.58, '#FFFFFF');
  }
}

module.exports = { id, accepts, render };
