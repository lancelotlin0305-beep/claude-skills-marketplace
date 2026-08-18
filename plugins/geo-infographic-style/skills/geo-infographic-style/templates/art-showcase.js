// [模板] art-showcase:畫風展示頁——右 2/3 滿版藝術插畫(指定畫風生成,不含任何文字),左側紙色
// 文字面板承載全部逐字內容(SVG)。用於「整頁換畫風」的探索/正式頁:插畫是敘事背景,資訊 100% SVG。
// 欄位:art(滿版插畫素材名,slice 裁切填滿)、artLabel(左下畫風標註)、title/lead、units[{color,name,item,money,text}]、
// modulesLabel/modules、conclude、footnote。中性色取 editorial-paper 色盤(建議 --palette=editorial-paper)。
const { box } = require('../scripts/engine');
const tk = require('../scripts/tokens');
const fs = require('fs'), path = require('path');

const id = 'art-showcase';
const accepts = c => !!c.art && Array.isArray(c.units) && !c.cards && !c.stats;

function render(doc, D) {
  const { P } = doc;
  const W = doc.W, H = doc.H;
  const accent = P.hue(D.accent || 'blue');
  const EP = P.name === 'editorial-paper' ? P.ink : null;
  const E = {
    paper: EP ? EP.pageBg : '#F8F6F1', ink: EP ? EP.title : '#1D2433', soft: EP ? EP.body : '#3A4256',
    muted: EP ? EP.muted : '#8A8577', hair: EP ? EP.line : '#E3DFD6',
  };
  const LW = 640;

  doc.push(`<rect width="${W}" height="${H}" fill="${E.paper}"/>`);

  // 右側滿版插畫(slice 裁切填滿;找不到即警告留紙色)
  const file = path.resolve(doc.assetsDir, D.art + '.png');
  if (fs.existsSync(file)) {
    const href = doc.outFile
      ? path.relative(path.dirname(path.resolve(doc.outFile)), file).replace(/\\/g, '/')
      : 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    doc.push(`<image href="${href}" x="${LW}" y="0" width="${W - LW}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`);
  } else doc.v.warn('asset', `找不到畫風插畫「${D.art}.png」(${doc.assetsDir})`, '§13');
  doc.push(`<line x1="${LW}" y1="0" x2="${LW}" y2="${H}" stroke="${E.hair}" stroke-width="1"/>`);
  if (D.artLabel) {
    const alW = tk.textWidth(D.artLabel, 15, 700) + 15 * 0.35 * D.artLabel.length + 32;
    doc.push(`<rect x="${LW + 24}" y="${H - 66}" width="${alW}" height="38" rx="19" fill="${E.paper}" opacity="0.92"/>`);
    doc.text(D.artLabel, LW + 24 + 16, H - 66 + 25, { size: 15, weight: 700, fill: E.muted, ls: 2 });
  }

  // 左側文字面板
  const LX = 60, TW = LW - LX - 44;
  let y = 96;
  doc.push(`<rect x="${LX}" y="${y}" width="56" height="5" fill="${accent.main}"/>`);
  y += 56;
  doc.text(D.title, LX, y, { size: 42, weight: 900, fill: E.ink, ls: 1 });
  y += 30;
  doc.wrap(D.lead, 19, TW).forEach(ln => { y += 31; doc.text(ln, LX, y, { size: 19, weight: 500, fill: E.soft }); });
  y += 26;

  D.units.forEach((u, i) => {
    const col = (u.color && P.hue(u.color)) || P.hue(i);
    y += 14;
    doc.push(`<circle cx="${LX + 7}" cy="${y + 16}" r="7" fill="${col.main}"/>`);
    doc.text(u.name, LX + 26, y + 24, { size: 23, weight: 900, fill: E.ink });
    let nx = LX + 26 + tk.textWidth(u.name, 23, 900) + 14;
    doc.text(u.item, nx, y + 24, { size: 17, weight: 800, fill: col.main, ls: 2 });
    const mW = tk.textWidth(u.money, 21, 900);
    doc.text(u.money, LX + TW, y + 24, { size: 21, weight: 900, fill: E.ink, anchor: 'end' });
    doc.v.clearance(`「${u.name}」列`, box(nx, y, tk.textWidth(u.item, 17, 800) + 17 * 0.35 * u.item.length, 24), box(LX + TW - mW, y, mW, 24), 12);
    y += 36;
    doc.wrap(u.text, 15.5, TW - 26).forEach(ln => { doc.text(ln, LX + 26, y + 12, { size: 15.5, weight: 500, fill: E.soft }); y += 26; });
    y += 8;
  });

  y += 16;
  doc.push(`<line x1="${LX}" y1="${y}" x2="${LX + TW}" y2="${y}" stroke="${E.hair}" stroke-width="1"/>`);
  y += 34;
  if (D.modules && D.modules.length) {
    doc.text(D.modulesLabel || '', LX, y, { size: 15, weight: 800, fill: E.muted, ls: 2 });
    y += 6;
    doc.wrap(D.modules.join('　·　'), 16, TW).forEach(ln => { y += 28; doc.text(ln, LX, y, { size: 16, weight: 700, fill: E.ink }); });
    y += 24;
  }
  if (D.conclude) {
    const qLines = doc.wrap(D.conclude, 17, TW - 22);
    doc.push(`<rect x="${LX}" y="${y - 6}" width="3.5" height="${qLines.length * 29 + 10}" fill="${accent.main}"/>`);
    qLines.forEach(ln => { y += 29; doc.text(ln, LX + 20, y - 8, { size: 17, weight: 700, fill: E.ink }); });
    y += 14;
  }
  if (D.footnote) {
    doc.wrap(D.footnote, 15, TW).forEach(ln => { y += 25; doc.text(ln, LX, y, { size: 15, weight: 400, fill: E.muted }); });
  }
  doc.v.inside('左欄內容', box(LX, 80, TW, y - 70), box(LX, 0, LW - LX, H - 40), '文字面板', '縮短內文或拆頁');
}

module.exports = { id, accepts, render };
