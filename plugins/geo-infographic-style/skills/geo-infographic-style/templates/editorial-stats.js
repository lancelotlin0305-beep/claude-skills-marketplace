// [模板] editorial-stats:雜誌數據跨頁(editorial-paper pack 專用,第二個 editorial 版式)。
// 版面:左欄「特稿開場」(色線+超大雙行標 84/900+導言+大型場景素材落柔影)｜右 2/3「數據網格」
// (2×N 巨數字格,髮線十字分隔:眉標→96px 裸數字→粗標籤→說明/灰色副統計)→ 底部 pull-quote 結語。
// 豐富層沿用 pack 規範:色暈、印刷角線、頁碼 meta、ghost 元素由版式自帶(數字即主角,不再疊 ghost)。
const { box, fitDisplay } = require('../scripts/engine');
const tk = require('../scripts/tokens');

const id = 'editorial-stats';
const accepts = c => Array.isArray(c.headline) && Array.isArray(c.stats) && !c.poster && !c.units && !c.cards && !c.columns;

function render(doc, D) {
  const { P, T } = doc;
  const W = doc.W, H = doc.H, M = doc.m;
  const accent = P.hue(D.accent || 'blue');
  const EP = P.name === 'editorial-paper' ? P.ink : null;
  const E = {
    paper: EP ? EP.pageBg : '#F8F6F1', ink: EP ? EP.title : '#1D2433', soft: EP ? EP.body : '#3A4256',
    muted: EP ? EP.muted : '#8A8577', hair: EP ? EP.line : '#E3DFD6', shadow: EP ? EP.title : '#1D2433',
  };

  // 紙感底 + 豐富層(色暈/角線/頁碼)
  doc.push(`<rect width="${W}" height="${H}" fill="${E.paper}"/>`);
  doc.push(`<defs><radialGradient id="eWash2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${accent.main}" stop-opacity="0.075"/><stop offset="1" stop-color="${accent.main}" stop-opacity="0"/></radialGradient></defs>`);
  doc.push(`<ellipse cx="${W - 220}" cy="110" rx="440" ry="300" fill="url(#eWash2)"/>`);
  doc.push(`<ellipse cx="170" cy="${H - 80}" rx="400" ry="270" fill="url(#eWash2)"/>`);
  const cm = 14, cmo = 34;
  [[cmo, cmo, 1, 1], [W - cmo, cmo, -1, 1], [cmo, H - cmo, 1, -1], [W - cmo, H - cmo, -1, -1]].forEach(([cx2, cy2, dx, dy]) => {
    doc.push(`<path d="M${cx2} ${cy2}h${cm * dx}M${cx2} ${cy2}v${cm * dy}" stroke="${E.hair}" stroke-width="1.5"/>`);
  });
  if (D.page) doc.text(D.page, W - cmo - 24, H - cmo + 5, { size: 15, weight: 700, fill: E.muted, ls: 2, anchor: 'end' });

  // ---------------------------------------------------------------- 左欄:特稿開場
  const LX = M, LW = 620;
  let y = 128;
  doc.push(`<rect x="${LX}" y="${y - 24}" width="56" height="5" fill="${accent.main}"/>`);
  D.headline.forEach(ln => {
    y += 92;
    doc.text(ln, LX, y, { size: 84, weight: 900, fill: E.ink, ls: 2 });
  });
  y += 46;
  doc.wrap(D.lead, 22, LW - 30).forEach(ln => { doc.text(ln, LX, y, { size: 22, weight: 500, fill: E.soft }); y += 38; });
  doc.v.inside('左欄標題導言', box(LX, 90, LW, y - 90), box(LX, 0, LW, H - 60), '左欄', '縮短導言');

  // 大型場景素材(滿欄寬,落柔影)
  if (D.hero) {
    const hy = Math.max(y + 60, 500) + 210;
    doc.push(`<ellipse cx="${LX + LW / 2}" cy="${hy + 216}" rx="${LW * 0.42}" ry="20" fill="${E.shadow}" opacity="0.08"/>`);
    doc.asset(D.hero, LX + LW / 2, hy, 368);
  }
  if (D.footnote) {
    doc.wrap(D.footnote, T.foot, LW).forEach((ln, j) => doc.text(ln, LX, H - 64 + j * 24, { size: T.foot, weight: 400, fill: E.muted }));
  }

  // ---------------------------------------------------------------- 右 2/3:數據網格(2 欄 × N 列,髮線十字)
  const RX = M + LW + 90, RW = W - M - RX;
  const stats = D.stats;
  const cols = 2, rows = Math.ceil(stats.length / cols);
  const gridTop = 128, gridBot = 812;
  const cellW = Math.floor(RW / cols), cellH = Math.floor((gridBot - gridTop) / rows);
  const padC = 40;

  // 棋盤式淡色色塊(雜誌手法:無框、直角、滿格出血;(row+col) 偶數格上色)
  stats.forEach((s, i) => {
    if ((Math.floor(i / cols) + (i % cols)) % 2 === 0) {
      const col = (s.color && P.hue(s.color)) || P.hue(i);
      doc.push(`<rect x="${RX + (i % cols) * cellW}" y="${gridTop + Math.floor(i / cols) * cellH}" width="${cellW}" height="${cellH}" fill="${col.light}" opacity="0.75"/>`);
    }
  });
  // 十字髮線
  for (let ci = 1; ci < cols; ci++) doc.push(`<line x1="${RX + ci * cellW}" y1="${gridTop + 12}" x2="${RX + ci * cellW}" y2="${gridBot - 12}" stroke="${E.hair}" stroke-width="1"/>`);
  for (let ri = 1; ri < rows; ri++) doc.push(`<line x1="${RX + 14}" y1="${gridTop + ri * cellH}" x2="${RX + RW - 14}" y2="${gridTop + ri * cellH}" stroke="${E.hair}" stroke-width="1"/>`);

  const hasCellAssets = stats.some(s => s.asset);
  const assetW = hasCellAssets ? 186 : 0;                 // 每格素材帶(右側,圖文並置)
  const innerC = cellW - padC * 2 - assetW;
  const numSize = Math.min(...stats.map(s =>
    fitDisplay(String(s.value), 96, Math.round((innerC + 30) * 0.92) - (s.unit ? tk.textWidth(s.unit, 24, 700) + 8 : 0))));
  const cellBoxes = [];
  stats.forEach((s, i) => {
    const col = (s.color && P.hue(s.color)) || P.hue(i);
    const cx0 = RX + (i % cols) * cellW + padC;
    const cy0 = gridTop + Math.floor(i / cols) * cellH;
    cellBoxes.push(box(cx0, cy0, cellW - padC * 2, cellH));
    // 格內素材(右側垂直置中,落柔影)
    if (s.asset) {
      const acx = cx0 + innerC + assetW / 2 + 6, acy = cy0 + cellH / 2 - 8;
      doc.push(`<ellipse cx="${acx}" cy="${acy + 74}" rx="72" ry="11" fill="${E.shadow}" opacity="0.08"/>`);
      doc.asset(s.asset, acx, acy, 138);
    }
    let sy = cy0 + 52;
    doc.push(`<rect x="${cx0}" y="${sy - 26}" width="26" height="4" fill="${col.main}"/>`);
    doc.text(s.eyebrow, cx0, sy, { size: 15, weight: 800, fill: col.main, ls: 3 });
    sy += Math.round(numSize * 0.88) + 26;
    doc.text(String(s.value), cx0, sy, { size: numSize, weight: 900, fill: E.ink, ls: -1 });
    if (s.unit) doc.text(s.unit, cx0 + tk.textWidth(String(s.value), numSize, 900) + 8, sy, { size: 24, weight: 700, fill: E.muted });
    sy += 44;
    doc.text(s.label, cx0, sy, { size: 24, weight: 800, fill: E.ink });
    sy += 14;
    // 說明列位於素材帶下緣以下,可用近全寬(素材垂直置中,底部淨空)
    if (s.desc) doc.wrap(s.desc, 19, cellW - padC * 2 - 8).forEach(ln => { sy += 30; doc.text(ln, cx0, sy, { size: 19, weight: 500, fill: E.soft }); });
    if (s.sub) { sy += 32; doc.text(s.sub, cx0, sy, { size: 19, weight: 700, fill: E.muted }); }
    doc.v.inside(`格「${s.label}」`, box(cx0, cy0 + 20, innerC, sy - cy0 - 20), box(cx0 - padC, cy0, cellW, cellH), '數據格', '縮短說明');
  });
  doc.v.noOverlap('數據格', cellBoxes);

  // ---------------------------------------------------------------- 底部 pull-quote 結語
  if (D.conclude) {
    const qSize = 27, qLH = 44;
    const qLines = doc.wrap(D.conclude.text, qSize, RW - 40);
    let qy = gridBot + 52;
    doc.push(`<rect x="${RX}" y="${qy - 30}" width="3.5" height="${qLines.length * qLH + 10}" fill="${accent.main}"/>`);
    const hi = D.conclude.hi || [];
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    qLines.forEach(ln => {
      let rest = ln, spans = '';
      while (rest.length) {
        const mm = re && rest.match(re);
        if (!mm) { spans += `<tspan>${doc.esc(rest)}</tspan>`; break; }
        if (mm.index > 0) spans += `<tspan>${doc.esc(rest.slice(0, mm.index))}</tspan>`;
        spans += `<tspan font-weight="900" fill="${accent.main}">${doc.esc(mm[1])}</tspan>`;
        rest = rest.slice(mm.index + mm[1].length);
      }
      doc.push(`<text x="${RX + 26}" y="${qy}" font-size="${qSize}" font-weight="800" fill="${E.ink}">${spans}</text>`);
      doc.v.punctuation(ln);
      qy += qLH;
    });
    doc.v.inside('結語', box(RX, gridBot + 10, RW, qy - gridBot - 10), box(RX, gridBot, RW, H - gridBot - 40), '底部區', '縮短結語');
  }
}

module.exports = { id, accepts, render };
