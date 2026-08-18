// [模板] art-annotated:圖文融合頁——滿版敘事插畫為版面本身,文字以「錨定標註」融進畫面:
// 引線標註卡(callouts:錨在畫面元素上)、場景標籤(tags,如 B1–B5 掛產線)、光暈標題(白描邊 halo,
// 不壓底框)、底部半透結語帶。插畫構圖須受控生成(元素位置照規格),標註座標由內容 JSON 驅動、
// 看渲染後迭代微調。文字 100% SVG 逐字;插畫不含任何文字(鐵則不變)。
const { box } = require('../scripts/engine');
const tk = require('../scripts/tokens');
const fs = require('fs'), path = require('path');

const id = 'art-annotated';
const accepts = c => !!c.art && Array.isArray(c.callouts) && !c.units && !c.stats;

function render(doc, D) {
  const { P } = doc;
  const W = doc.W, H = doc.H;
  const EP = P.name === 'editorial-paper' ? P.ink : null;
  const E = { paper: EP ? EP.pageBg : '#F8F6F1', ink: EP ? EP.title : '#1D2433', soft: EP ? EP.body : '#3A4256', muted: EP ? EP.muted : '#8A8577' };
  const halo = (t, x, y, size, weight, fill, sw = 9, anchor = 'start', ls = 0) => {
    doc.v.font(String(t).slice(0, 8), size); doc.v.punctuation(t);
    doc.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''} stroke="#FFFFFF" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke">${doc.esc(t)}</text>`);
    return box(anchor === 'middle' ? x - tk.textWidth(t, size, weight) / 2 : x, y - size, tk.textWidth(t, size, weight), size * 1.2);
  };

  // 滿版插畫
  const file = path.resolve(doc.assetsDir, D.art + '.png');
  if (fs.existsSync(file)) {
    const href = doc.outFile
      ? path.relative(path.dirname(path.resolve(doc.outFile)), file).replace(/\\/g, '/')
      : 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    doc.push(`<image href="${href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`);
  } else { doc.push(`<rect width="${W}" height="${H}" fill="${E.paper}"/>`); doc.v.warn('asset', `找不到融合插畫「${D.art}.png」`, '§13'); }

  // 光暈標題 + 導言(進畫面天空區)——字級一律接 16:9 錨定表(簡報用途,§6.1)
  const T = doc.T;
  const tpos = D.titlePos || { x: 64, y: 128 };
  const accent = P.hue(D.accent || 'blue');
  doc.push(`<rect x="${tpos.x}" y="${tpos.y - 74}" width="56" height="6" fill="${accent.main}"/>`);
  const tb = halo(D.title, tpos.x, tpos.y, T.title, 900, E.ink, 13);
  let ly = tpos.y + 26;
  if (D.lead) doc.wrap(D.lead, T.sub, D.leadW || 560).forEach(ln => { ly += 34; halo(ln, tpos.x, ly, T.sub, 600, E.soft, 8); });

  // 錨定標註卡(引線 + 白色半透卡:色點+名稱+項目 / 經費 / 內文)
  const boxes = [tb];
  (D.callouts || []).forEach((c, i) => {
    const col = (c.color && P.hue(c.color)) || P.hue(i);
    const cw = c.w || 330, pad = 18;
    const nameW = tk.textWidth(c.name, T.subCard, 900);
    const lines = doc.wrap(c.text, T.note, cw - pad * 2);
    const chH = 16 + 32 + 32 + lines.length * 31 + 16;
    const cb = box(c.x, c.y, cw, chH);
    boxes.push(cb);
    // 引線:卡緣中點 → 錨點
    const ex = c.ax < cb.x ? cb.x : c.ax > cb.right ? cb.right : cb.cx;
    const ey = c.ax >= cb.x && c.ax <= cb.right ? (c.ay < cb.y ? cb.y : cb.bottom) : cb.cy;
    doc.push(`<line x1="${ex}" y1="${ey}" x2="${c.ax}" y2="${c.ay}" stroke="${col.main}" stroke-width="2" opacity="0.85"/>`);
    doc.push(`<circle cx="${c.ax}" cy="${c.ay}" r="6" fill="${col.main}" stroke="#FFFFFF" stroke-width="2"/>`);
    doc.push(`<g filter="url(#row)"><rect x="${cb.x}" y="${cb.y}" width="${cw}" height="${chH}" rx="12" fill="#FFFFFF" opacity="0.94"/></g>`);
    doc.push(`<rect x="${cb.x}" y="${cb.y}" width="5" height="${chH}" rx="2.5" fill="${col.main}"/>`);
    let sy = cb.y + 16 + 21;
    doc.text(c.name, cb.x + pad, sy, { size: T.subCard, weight: 900, fill: E.ink });
    doc.text(c.item, cb.x + pad + nameW + 14, sy, { size: T.pill, weight: 800, fill: col.main, ls: 1.5 });
    sy += 32;
    doc.text(c.money, cb.x + pad, sy, { size: T.sub, weight: 900, fill: col.main });
    sy += 10;
    lines.forEach(ln => { sy += 31; doc.text(ln, cb.x + pad, sy, { size: T.note, weight: 500, fill: E.soft }); });
    doc.v.inside(`標註卡「${c.name}」`, cb, box(0, 0, W, H - (D.banner ? 78 : 0)), '頁面', '調整座標');
    doc.v.clearance(`引線「${c.name}」`, cb, box(c.ax - 4, c.ay - 4, 8, 8), -9999);
  });

  // 場景標籤(如 B1–B5 掛產線)
  if (D.tagsLabel) halo(D.tagsLabel.text, D.tagsLabel.x, D.tagsLabel.y, T.sub, 800, E.muted, 8, 'start', 2);
  (D.tags || []).forEach((t2, i) => {
    const col = (t2.color && P.hue(t2.color)) || P.hue(i);
    const w2 = tk.textWidth(t2.text, T.note, 800) + 48;
    doc.push(`<g filter="url(#row)"><rect x="${t2.x}" y="${t2.y - 21}" width="${w2}" height="42" rx="21" fill="#FFFFFF" opacity="0.93"/></g>`);
    doc.push(`<circle cx="${t2.x + 18}" cy="${t2.y}" r="6" fill="${col.main}"/>`);
    doc.text(t2.text, t2.x + 32, t2.y + T.note * 0.36, { size: T.note, weight: 800, fill: E.ink });
    boxes.push(box(t2.x, t2.y - 21, w2, 42));
  });
  doc.v.noOverlap('標註元素', boxes);

  // 底部半透結語帶
  if (D.banner) {
    const bh = 88;
    doc.push(`<rect x="0" y="${H - bh}" width="${W}" height="${bh}" fill="#FFFFFF" opacity="0.92"/>`);
    doc.push(`<rect x="0" y="${H - bh}" width="${W}" height="1.5" fill="${accent.main}" opacity="0.5"/>`);
    const cSize = T.tile;   // 結語 24/700(16:9 錨定)
    const hi = D.banner.hi || [];
    const re = hi.length ? new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')') : null;
    let rest = D.banner.text, spans = '';
    while (rest.length) {
      const mm = re && rest.match(re);
      if (!mm) { spans += `<tspan>${doc.esc(rest)}</tspan>`; break; }
      if (mm.index > 0) spans += `<tspan>${doc.esc(rest.slice(0, mm.index))}</tspan>`;
      spans += `<tspan font-weight="900" fill="${accent.main}">${doc.esc(mm[1])}</tspan>`;
      rest = rest.slice(mm.index + mm[1].length);
    }
    doc.push(`<text x="${W / 2}" y="${H - bh / 2 + cSize * 0.36}" font-size="${cSize}" font-weight="700" fill="${E.ink}" text-anchor="middle">${spans}</text>`);
    doc.v.punctuation(D.banner.text);
  }
  if (D.footnote) halo(D.footnote, 40, H - (D.banner ? 88 : 0) - 20, 18, 600, E.soft, 8);
  if (D.artLabel) halo(D.artLabel, W - 40, 40, 15, 700, E.muted, 7, 'end', 2);
}

module.exports = { id, accepts, render };
