// [模板・原型] editorial-split:美編級編輯構圖(P42 設計感升級第二步的驗證原型)。
// 設計語言與預設八色風相反——**減法**:無邊框(髮線+留白分層)、一頁一主色+暖灰紙感底(類別色只做
// 小色點/眉標/細節線)、眉標字距系統、巨大裸數字、左對齊、不對稱 1/3–2/3 構圖、無具象裝飾。
// 版面:左欄(大標+導言+引言塊+註)｜右 2/3 三欄(場景素材→眉標+MOU→單位名→內文→裸數字),
// 髮線分欄,底部細線收進 B1–B5 模組列。
// 中性色取自 editorial-paper 色盤(tokens.json);建議一律以 --palette=editorial-paper 產製。
const { box, fitDisplay } = require('../scripts/engine');
const tk = require('../scripts/tokens');

const id = 'editorial-split';
const accepts = c => Array.isArray(c.headline) && Array.isArray(c.units) && !c.cards && !c.columns;

function render(doc, D) {
  const { P, T } = doc;
  const W = doc.W, H = doc.H, M = doc.m, CW = doc.contentW;
  const accent = P.hue(D.accent || 'blue');
  // 紙感中性色由色盤供給(editorial-paper);其他色盤下退回紙感預設值以維持本版式語言
  const EP = P.name === 'editorial-paper' ? P.ink : null;
  const E = {
    paper: EP ? EP.pageBg : '#F8F6F1', ink: EP ? EP.title : '#1D2433', soft: EP ? EP.body : '#3A4256',
    muted: EP ? EP.muted : '#8A8577', hair: EP ? EP.line : '#E3DFD6', shadow: EP ? EP.title : '#1D2433',
  };

  // 紙感底(單一平色,美編語言的安靜背景;不套 pageBg/decor)
  doc.push(`<rect width="${W}" height="${H}" fill="${E.paper}"/>`);
  // 豐富層(編輯語彙,不載資訊):柔和色暈 ×2、印刷角線、頁碼 meta
  doc.push(`<defs><radialGradient id="eWash" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${accent.main}" stop-opacity="0.075"/><stop offset="1" stop-color="${accent.main}" stop-opacity="0"/></radialGradient></defs>`);
  doc.push(`<ellipse cx="${W - 240}" cy="120" rx="460" ry="320" fill="url(#eWash)"/>`);
  doc.push(`<ellipse cx="150" cy="${H - 90}" rx="420" ry="280" fill="url(#eWash)"/>`);
  const cm = 14, cmo = 34;
  [[cmo, cmo, 1, 1], [W - cmo, cmo, -1, 1], [cmo, H - cmo, 1, -1], [W - cmo, H - cmo, -1, -1]].forEach(([cx2, cy2, dx, dy]) => {
    doc.push(`<path d="M${cx2} ${cy2}h${cm * dx}M${cx2} ${cy2}v${cm * dy}" stroke="${E.hair}" stroke-width="1.5"/>`);
  });
  if (D.page) doc.text(D.page, W - cmo - 24, H - cmo + 5, { size: 15, weight: 700, fill: E.muted, ls: 2, anchor: 'end' });

  // ---------------------------------------------------------------- 左欄(1/3 敘事區)
  const LX = M, LW = 500;
  let y = 150;
  doc.push(`<rect x="${LX}" y="${y - 46}" width="56" height="5" fill="${accent.main}"/>`);
  D.headline.forEach(ln => {
    doc.text(ln, LX, y + 46, { size: 52, weight: 900, fill: E.ink, ls: 1 });
    y += 68;
  });
  y += 26;
  const leadLines = doc.wrap(D.lead, T.body, LW - 20);
  leadLines.forEach(ln => { doc.text(ln, LX, y + 20, { size: T.body, weight: 500, fill: E.soft }); y += 37; });

  // 引言塊(結論句移進左欄 → 不對稱敘事;大型裝飾引號)
  if (D.quote) {
    y += 44;
    doc.push(`<text x="${LX - 6}" y="${y + 8}" font-size="76" font-weight="900" fill="${accent.main}" fill-opacity="0.18" font-family="Georgia,serif">“</text>`);
    const qSize = 23, qLH = 40;
    const qLines = doc.wrap(D.quote.text, qSize, LW - 36);
    doc.push(`<rect x="${LX}" y="${y}" width="3.5" height="${qLines.length * qLH + 14}" fill="${accent.main}"/>`);
    const hi = D.quote.hi || [];
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    let qy = y + 30;
    qLines.forEach(ln => {
      let rest = ln, spans = '';
      while (rest.length) {
        const mm = re && rest.match(re);
        if (!mm) { spans += `<tspan>${doc.esc(rest)}</tspan>`; break; }
        if (mm.index > 0) spans += `<tspan>${doc.esc(rest.slice(0, mm.index))}</tspan>`;
        spans += `<tspan font-weight="900" fill="${E.ink}">${doc.esc(mm[1])}</tspan>`;
        rest = rest.slice(mm.index + mm[1].length);
      }
      doc.push(`<text x="${LX + 26}" y="${qy}" font-size="${qSize}" font-weight="600" fill="${E.soft}">${spans}</text>`);
      doc.v.punctuation(ln);
      qy += qLH;
    });
    y = qy + 8;
  }
  if (D.note) {
    y += 30;
    doc.wrap(D.note, T.foot, LW - 20).forEach(ln => { doc.text(ln, LX, y + 14, { size: T.foot, weight: 400, fill: E.muted }); y += 25; });
  }
  // 左欄底部:合計大數字錨點(選填;填補留白並給頁面第二個視覺焦點)
  if (D.total) {
    const tBase = H - 130;
    const tSize = 76;
    doc.text(D.total.label, LX, tBase - Math.round(tSize * 0.88) - 30, { size: 15, weight: 800, fill: E.muted, ls: 3 });
    doc.push(`<rect x="${LX}" y="${tBase - Math.round(tSize * 0.88) - 20}" width="34" height="4" fill="${accent.main}"/>`);
    doc.text(String(D.total.money), LX, tBase, { size: tSize, weight: 900, fill: E.ink, ls: -1 });
    if (D.total.unit) doc.text(D.total.unit, LX + tk.textWidth(String(D.total.money), tSize, 900) + 8, tBase, { size: 20, weight: 700, fill: E.muted });
    doc.v.clearance('左欄註與合計', box(LX, y - 20, LW, 20), box(LX, tBase - Math.round(tSize * 0.88) - 50, LW, 130), 12);
  }
  doc.v.inside('左欄敘事', box(LX, 90, LW, y - 80), box(LX, 0, LW, H - 60), '左欄', '縮短導言或引言');

  // ---------------------------------------------------------------- 右 2/3 三欄(髮線分欄,無框)
  const RX = M + LW + 100, RW = W - M - RX;
  const units = D.units;
  const colGap = 56;
  const colW = Math.floor((RW - (units.length - 1) * colGap) / units.length);
  const topU = 150, heroH = 216, botLine = 828;

  // 垂直髮線
  for (let i = 1; i < units.length; i++) {
    const hx = RX + i * colW + (i - 1) * colGap + colGap / 2;
    doc.push(`<line x1="${hx}" y1="${topU + 10}" x2="${hx}" y2="${botLine - 24}" stroke="${E.hair}" stroke-width="1"/>`);
  }

  const moneySize = Math.min(...units.map(u => fitDisplay(String(u.money), 84, colW - tk.textWidth(u.unit || '', 20, 700) - 90)));
  const colBoxes = [];
  units.forEach((u, i) => {
    const col = (u.color && P.hue(u.color)) || P.hue(i);
    const x = RX + i * (colW + colGap);
    const cxU = x + colW / 2;
    colBoxes.push(box(x, topU, colW, botLine - topU));

    // 欄位序號 ghost 數字(01/02/03,墨色 7%,素材壓其上製造層次)
    doc.push(`<text x="${x - 6}" y="${topU + 78}" font-size="92" font-weight="900" fill="${E.ink}" fill-opacity="0.07" letter-spacing="-2">${String(i + 1).padStart(2, '0')}</text>`);
    // 場景素材:落在柔和橢圓陰影上(無圓圈框)
    doc.push(`<ellipse cx="${cxU}" cy="${topU + heroH - 10}" rx="${colW * 0.36}" ry="14" fill="${E.shadow}" opacity="0.08"/>`);
    if (!doc.asset(u.hero, cxU, topU + heroH / 2, Math.round(heroH * 1.05))) {
      doc.push(`<circle cx="${cxU}" cy="${topU + heroH / 2}" r="60" fill="#FFFFFF" stroke="${E.hair}" stroke-width="1"/>`);
    }

    let uy = topU + heroH + 52;
    // 眉標(委託項目,字距 4)+ 右側 MOU 微標
    doc.text(u.item, x, uy, { size: 15, weight: 800, fill: col.main, ls: 4 });
    if (u.tag) doc.text(u.tag, x + colW, uy, { size: 15, weight: 600, fill: E.muted, ls: 1.5, anchor: 'end' });
    uy += 14;
    // 單位名
    doc.text(u.name, x, uy + 30, { size: 30, weight: 900, fill: E.ink });
    uy += 52;
    // 工作內容(微標 + 段落,左對齊)
    doc.text(D.bodyHead || '工作內容', x, uy + 14, { size: 15, weight: 700, fill: E.muted, ls: 2 });
    uy += 30;
    const bodyLines = u.lines || doc.wrap(u.text, 20, colW);
    bodyLines.forEach(ln => { doc.text(ln, x, uy + 18, { size: 20, weight: 500, fill: E.soft }); uy += 33; });
    doc.v.inside(`「${u.name}」內文`, box(x, topU + heroH, colW, uy - topU - heroH), box(x, topU, colW, botLine - topU), '欄位', '縮短內文');

    // 裸數字(金額,底部對齊)
    const my = botLine - 58;
    doc.push(`<rect x="${x}" y="${my - Math.round(moneySize * 0.88) - 22}" width="34" height="4" fill="${col.main}"/>`);
    doc.text(String(u.money), x, my, { size: moneySize, weight: 900, fill: E.ink, ls: -1 });
    if (u.unit) doc.text(u.unit, x + tk.textWidth(String(u.money), moneySize, 900) + 8, my, { size: 20, weight: 700, fill: E.muted });
    // 金額比例細線(數值已直標,線僅視覺比例;§7 語彙的髮線版)
    const maxMoney = Math.max(...units.map(u2 => parseFloat(u2.money) || 0));
    if (maxMoney > 0) {
      doc.push(`<rect x="${x}" y="${my + 22}" width="${colW}" height="3" fill="${E.hair}"/>`);
      doc.push(`<rect x="${x}" y="${my + 22}" width="${Math.max(6, Math.round(colW * (parseFloat(u.money) || 0) / maxMoney))}" height="3" fill="${col.main}"/>`);
    }
  });
  doc.v.noOverlap('三欄', colBoxes);

  // ---------------------------------------------------------------- 底部:細線收進 B1–B5 模組列
  doc.push(`<line x1="${RX}" y1="${botLine}" x2="${W - M}" y2="${botLine}" stroke="${E.hair}" stroke-width="1"/>`);
  units.forEach((u, i) => {
    const col = (u.color && P.hue(u.color)) || P.hue(i);
    const cxU = RX + i * (colW + colGap) + colW / 2;
    doc.push(`<line x1="${cxU}" y1="${botLine}" x2="${cxU}" y2="${botLine + 26}" stroke="${col.main}" stroke-width="2"/>`);
    doc.push(`<circle cx="${cxU}" cy="${botLine + 30}" r="3.5" fill="${col.main}"/>`);
  });
  if (D.modules && D.modules.length) {
    const my2 = botLine + 74;
    let mx = RX;
    if (D.modulesLabel) {
      doc.text(D.modulesLabel, mx, my2, { size: 15, weight: 800, fill: E.muted, ls: 3 });
      mx += tk.textWidth(D.modulesLabel, 15, 800) + Math.max(20, 13 * 0.35 * D.modulesLabel.length) + 26;
    }
    const chipSize = 17;
    const widths = D.modules.map(t => tk.textWidth(t, chipSize, 700));
    const totW = widths.reduce((a, b2) => a + b2, 0);
    const mgap = Math.max(24, (W - M - mx - totW) / Math.max(1, D.modules.length - 1));
    D.modules.forEach((t, j) => {
      doc.text(t, mx, my2, { size: chipSize, weight: 700, fill: E.ink });
      mx += widths[j] + mgap;
      if (j < D.modules.length - 1) doc.push(`<circle cx="${mx - mgap / 2}" cy="${my2 - 6}" r="2.2" fill="${E.muted}"/>`);
    });
    doc.v.inside('模組列', box(RX, my2 - 18, Math.min(mx, W - M) - RX, 26), box(M, botLine, CW, H - botLine), '底部區');
  }
}

module.exports = { id, accepts, render };
