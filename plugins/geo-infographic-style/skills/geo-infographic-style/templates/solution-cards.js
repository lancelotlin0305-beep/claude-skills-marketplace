// [模板] 方案卡列:N 張(2–4)並列方案卡 → [匯流帶] → 結論帶。對應「比較差異/方案選擇/分工支援」類頁面。
// 每卡:深色標題列(方案名 + 右側白膠囊 tag)→ [hero 素材帶(L3)] → 節點鏈(chain:膠囊 + 連接線)
// → 多個內文節(sections:節標題 + 段落(可 hi)或 bullet 清單)→ [卡底 footer 帶(如經費)]。
// 跨卡以槽格線對齊;連接線 link:"single"(—)/"double"(＝)。chain 膠囊 strong:0 白底/1 深色實心/2 專色淺實心。
// 頁物件 merge:{label, chips[], color} → 卡列下方全寬匯流帶,各卡以專色箭頭垂直匯入(分工支援語彙,P42)。
const { box, grid } = require('../scripts/engine');
const { icon } = require('../scripts/icons');
const tk = require('../scripts/tokens');

const id = 'solution-cards';
const accepts = c => Array.isArray(c.cards) && c.cards.length >= 2 && c.cards.length <= 4 &&
                     c.cards.every(k => Array.isArray(k.sections)) && !c.columns && !c.hub;

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
  const mergeH = D.merge ? 88 : 0, arrowZone = D.merge ? 40 : 0;
  const cardH = bottomLimit - top - (cclH ? cclH + gapBand : 0) - (mergeH ? mergeH + arrowZone + gapBand : 0);

  const cells = grid(cards.length, { x: M, w: CW, gap: doc.geo('gap.col') });
  const colW = cells[0].w;
  const cardPad = doc.geo('padding.cardX');
  const padY = doc.geo('padding.cardY');
  const innerW = colW - cardPad * 2;
  const hdrH = 60;

  // chain 量測:膠囊寬 = 內容 + 內距(§3.1);文字 > 5 字走平衡斷行成兩行
  const pillSize = T.pill, pillPadX = 14, pillLineH = Math.round(pillSize * 1.3), linkLen = 26, linkGap = 8;
  const chains = cards.map(c => (c.chain || []).map(ch2 => {
    const lines = tk.wrapBalanced(ch2.text, pillSize, pillSize * 5.5);
    const w = Math.max(...lines.map(l => tk.textWidth(l, pillSize))) + pillPadX * 2;
    const h = lines.length * pillLineH + 16;
    return { ...ch2, lines, w, h };
  }));
  const chainH = Math.max(0, ...chains.map(chips => chips.length ? Math.max(...chips.map(p => p.h)) : 0));

  // sections 量測:head + 段落斷行 或 bullets 斷行
  const secLH = tk.lineHeight(T.body);
  const meas = cards.map(c => c.sections.map(s => {
    if (s.bullets) {
      const rows = s.bullets.map(bt => doc.wrap(bt, T.body, innerW - 24));
      return { ...s, rows, bodyH: rows.reduce((a, r) => a + r.length * secLH, 0) + (rows.length - 1) * 6 };
    }
    const lines = s.lines || doc.wrap(s.text, T.body, innerW);
    return { ...s, lines, bodyH: lines.length * secLH };
  }));
  const nSec = Math.max(...meas.map(m => m.length));
  const headH = tk.lineHeight(T.note);
  const heroH = cards.some(c => c.hero) ? 130 : 0;      // L3 素材帶(任一卡有 hero 即全列保留,等高對齊)
  const footH2 = cards.some(c => c.footer) ? 54 : 0;    // 卡底帶(如經費)
  // 槽格線:hero、chain、每節的 head/body、節間分隔線、footer,槽高取全卡最大值
  const slotList = [];
  if (heroH) slotList.push({ key: 'hero', h: heroH });
  if (chainH) slotList.push({ key: 'chain', h: chainH });
  for (let s = 0; s < nSec; s++) {
    if (s > 0) slotList.push({ key: 'div' + s, h: 1 });
    slotList.push({ key: 'head' + s, h: headH });
    slotList.push({ key: 'body' + s, h: Math.max(...meas.map(m => m[s] ? m[s].bodyH : 0)) });
  }
  if (footH2) slotList.push({ key: 'foot', h: footH2 });
  const gapBase = doc.geo('gap.childToFrame') + 4;
  const natH = slotList.reduce((a, s) => a + s.h, 0);
  const gapN = slotList.length - 1;
  const flex = cardH - hdrH - padY * 2 - natH - gapBase * gapN;
  const gapExtra = Math.max(0, Math.min(26, gapN ? flex / gapN : 0));
  const step = gapBase + gapExtra;
  const topOffset = hdrH + padY + Math.max(0, (flex - gapExtra * gapN) / 2);

  doc.v.fillGroup('方案卡列', meas.map((m, i) => Math.max(
    ...m.flatMap(s => s.lines ? s.lines.map(l => tk.textWidth(l, T.body)) : s.rows.flatMap(r => r.map(l => 24 + tk.textWidth(l, T.body)))),
    chains[i].reduce((a, p) => a + p.w, 0) + Math.max(0, chains[i].length - 1) * (linkLen + linkGap * 2))), colW);
  doc.v.inside('方案卡列', box(M, top, CW, cardH + (cclH ? cclH + gapBand : 0)),
               box(M, top, CW, bottomLimit - top), '內容區', `減少節內文字或卡數;卡數現 ${cards.length}`);
  doc.v.verticalFill('方案卡列', cardH + (mergeH ? mergeH + arrowZone + gapBand : 0) + (cclH ? cclH + gapBand : 0), bottomLimit - top);

  // 段落 hi 關鍵詞:逐行比對(關鍵詞被斷行切開時該行不加粗,寧缺勿錯)
  const hiLine = (line, hi, col) => {
    if (!hi || !hi.length) return `<tspan>${doc.esc(line)}</tspan>`;
    const re = new RegExp('(' + hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
    let rest = line, out = '';
    while (rest.length) {
      const mm = rest.match(re);
      if (!mm) { out += `<tspan>${doc.esc(rest)}</tspan>`; break; }
      if (mm.index > 0) out += `<tspan>${doc.esc(rest.slice(0, mm.index))}</tspan>`;
      out += `<tspan fill="${col.main}" font-weight="700">${doc.esc(mm[1])}</tspan>`;
      rest = rest.slice(mm.index + mm[1].length);
    }
    return out;
  };

  // ---------------------------------------------------------------- 卡片
  const cardBoxes = [];
  cards.forEach((c, i) => {
    const col = hueOf(c, i);
    const m = meas[i];
    const b = box(cells[i].x, top, colW, cardH);
    cardBoxes.push(b);
    doc.card(b, col);
    // 深色標題列 + 方案名 + 右側英文白膠囊
    doc.push(`<path d="M${b.x} ${b.y + 16}a16 16 0 0 1 16 -16h${b.w - 32}a16 16 0 0 1 16 16v${hdrH - 16}h${-b.w}z" fill="url(#${gradOf(col.key)})" filter="url(#hdr)"/>`);
    const ht = doc.text(c.title, b.x + cardPad, b.y + hdrH / 2 + T.cardTitle * 0.36, { size: T.cardTitle, weight: 800, fill: '#FFFFFF' });
    if (c.tag) {
      const tw = tk.textWidth(c.tag, T.pill) + 26, thH = 34;
      doc.push(`<rect x="${b.right - cardPad - tw}" y="${b.y + (hdrH - thH) / 2}" width="${tw}" height="${thH}" rx="${thH / 2}" fill="#FFFFFF" opacity="0.94"/>`);
      doc.text(c.tag, b.right - cardPad - tw / 2, b.y + hdrH / 2 + T.pill * 0.36, { size: T.pill, weight: 700, fill: col.deep, anchor: 'middle' });
      doc.v.clearance(`卡「${c.title}」標題與膠囊`, ht, box(b.right - cardPad - tw, b.y, tw, hdrH), 12);
    }

    let y = b.y + topOffset;
    slotList.forEach(s => {
      if (s.key === 'hero') {
        const hy = y + s.h / 2;
        if (!doc.asset(c.hero, b.cx, hy, Math.round(s.h * 0.72))) {
          doc.push(`<circle cx="${b.cx}" cy="${hy}" r="${s.h * 0.34}" fill="${col.light}" stroke="${col.main}" stroke-width="${tk.stroke('subCard')}" filter="url(#card2)"/>`);
          ic(c.heroIcon || 'cube', b.cx - s.h * 0.18, hy - s.h * 0.18, s.h * 0.36, col.main);
        }
      } else if (s.key === 'foot') {
        if (c.footer) {
          doc.push(`<rect x="${b.x + cardPad}" y="${y}" width="${innerW}" height="${s.h}" rx="12" fill="${col.light}" stroke="${col.edge}" stroke-width="${tk.stroke('hairline')}"/>`);
          const ftW = tk.textWidth(c.footer.label, T.sub) + 10 + tk.textWidth(c.footer.value, T.tile, 900);
          let fx = b.cx - ftW / 2;
          doc.text(c.footer.label, fx, y + s.h / 2 + T.sub * 0.36, { size: T.sub, weight: 700, fill: ink.body });
          fx += tk.textWidth(c.footer.label, T.sub) + 10;
          doc.text(c.footer.value, fx, y + s.h / 2 + T.tile * 0.36, { size: T.tile, weight: 900, fill: col.main });
        }
      } else if (s.key === 'chain' && chains[i].length) {
        // 節點鏈:膠囊置中排列;strong 1=深色實心白字、2=專色淺實心深字、0=白底
        const chips = chains[i];
        const totW = chips.reduce((a, p) => a + p.w, 0) + (chips.length - 1) * (linkLen + linkGap * 2);
        let cx2 = b.cx - totW / 2;
        const cyC = y + s.h / 2;
        chips.forEach((p, j) => {
          if (j > 0) {
            const lx = cx2 - linkGap - linkLen;
            if ((c.link || 'single') === 'double') {
              doc.push(`<line x1="${lx}" y1="${cyC - 4}" x2="${lx + linkLen}" y2="${cyC - 4}" stroke="${col.main}" stroke-width="2.5"/>` +
                       `<line x1="${lx}" y1="${cyC + 4}" x2="${lx + linkLen}" y2="${cyC + 4}" stroke="${col.main}" stroke-width="2.5"/>`);
            } else {
              doc.push(`<line x1="${lx}" y1="${cyC}" x2="${lx + linkLen}" y2="${cyC}" stroke="${col.main}" stroke-width="2.5"/>`);
            }
          }
          const py = cyC - p.h / 2;
          if (p.strong === 1) doc.push(`<g filter="url(#row)"><rect x="${cx2}" y="${py}" width="${p.w}" height="${p.h}" rx="12" fill="url(#${gradOf(col.key)})"/></g>`);
          else if (p.strong === 2) doc.push(`<g filter="url(#row)"><rect x="${cx2}" y="${py}" width="${p.w}" height="${p.h}" rx="12" fill="${col.light}" stroke="${col.main}" stroke-width="${tk.stroke('subCard')}"/></g>`);
          else doc.push(`<g filter="url(#row)"><rect x="${cx2}" y="${py}" width="${p.w}" height="${p.h}" rx="12" fill="#FFFFFF" stroke="${col.edge}" stroke-width="${tk.stroke('subCard')}"/></g>`);
          const fill = p.strong === 1 ? '#FFFFFF' : p.strong === 2 ? col.deep : ink.body;
          let ty = py + (p.h - p.lines.length * pillLineH) / 2 + pillSize * 0.95;
          p.lines.forEach(ln => { doc.text(ln, cx2 + p.w / 2, ty, { size: pillSize, weight: 700, fill, anchor: 'middle' }); ty += pillLineH; });
          cx2 += p.w + linkLen + linkGap * 2;
        });
      } else if (s.key.startsWith('div')) {
        doc.push(`<line x1="${b.x + cardPad}" y1="${y + 0.5}" x2="${b.right - cardPad}" y2="${y + 0.5}" stroke="${ink.line}" stroke-width="${tk.stroke('hairline')}"/>`);
      } else if (s.key.startsWith('head')) {
        const sec = m[+s.key.slice(4)];
        if (sec) doc.text(sec.head, b.x + cardPad, y + tk.capHeight(T.note), { size: T.note, weight: 700, fill: ink.muted });
      } else if (s.key.startsWith('body')) {
        const sec = m[+s.key.slice(4)];
        if (sec) {
          let yy = y;
          if (sec.rows) {
            sec.rows.forEach(r => {
              doc.push(`<circle cx="${b.x + cardPad + 7}" cy="${yy + tk.capHeight(T.body) * 0.62}" r="5" fill="${col.main}"/>`);
              r.forEach(ln => { doc.text(ln, b.x + cardPad + 24, yy + tk.capHeight(T.body), { size: T.body, weight: 500, fill: ink.body }); yy += secLH; });
              yy += 6;
            });
          } else {
            sec.lines.forEach(ln => {
              doc.push(`<text x="${b.x + cardPad}" y="${yy + tk.capHeight(T.body)}" font-size="${T.body}" font-weight="500" fill="${ink.body}">${hiLine(ln, sec.hi, col)}</text>`);
              doc.v.punctuation(ln); doc.v.font(ln.slice(0, 8), T.body);
              yy += secLH;
            });
          }
        }
      }
      y += s.h + step;
    });
    doc.v.inside(`卡「${c.title}」內容`, box(b.x + cardPad, b.y + hdrH, innerW, y - step - b.y - hdrH), b, '方案卡',
                 '縮短節內文字或拆頁');
  });
  doc.v.noOverlap('方案卡', cardBoxes);

  // ---------------------------------------------------------------- 匯流帶(各卡專色箭頭垂直匯入)
  let afterCards = top + cardH;
  if (D.merge) {
    const mcol = P.hue(D.merge.color || 'blue');
    const ay0 = top + cardH + 8, ay1 = top + cardH + arrowZone - 2;
    cardBoxes.forEach((cb2, i) => {
      const col = hueOf(cards[i], i);
      doc.push(`<line x1="${cb2.cx}" y1="${ay0}" x2="${cb2.cx}" y2="${ay1 - 10}" stroke="${col.main}" stroke-width="${doc.geo('connector.flowWidth')}"/>`);
      doc.push(`<path d="M${cb2.cx - 7} ${ay1 - 10}h14l-7 10z" fill="${col.main}"/>`);
    });
    const mb = box(M, top + cardH + arrowZone, CW, mergeH);
    doc.push(`<rect x="${mb.x}" y="${mb.y + 6}" width="${mb.w}" height="${mb.h}" rx="14" fill="${mcol.main}" opacity="0.14"/>`);
    doc.roundRect(mb, { r: doc.geo('radius.band'), fill: `url(#${bandOf(mcol.key)})`, stroke: mcol.main, sw: tk.stroke('card'), filter: 'shadow' });
    let mx = mb.x + cardPad;
    doc.text(D.merge.label, mx, mb.cy + T.cardTitle * 0.36, { size: T.cardTitle, weight: 800, fill: mcol.deep });
    mx += tk.textWidth(D.merge.label, T.cardTitle) + 30;
    const chips = D.merge.chips || [];
    if (chips.length) {
      const cw = chips.map(t => tk.textWidth(t, T.pill, 700) + 28);
      const totW = cw.reduce((a, w2) => a + w2, 0);
      const cgap = Math.max(12, (mb.right - cardPad - mx - totW) / Math.max(1, chips.length - 1));
      chips.forEach((t, j) => {
        doc.push(`<g filter="url(#row)"><rect x="${mx}" y="${mb.cy - 20}" width="${cw[j]}" height="40" rx="20" fill="#FFFFFF" stroke="${mcol.edge}" stroke-width="${tk.stroke('subCard')}"/></g>`);
        doc.text(t, mx + cw[j] / 2, mb.cy + T.pill * 0.36, { size: T.pill, weight: 700, fill: mcol.deep, anchor: 'middle' });
        mx += cw[j] + cgap;
      });
    }
    doc.v.inside('匯流帶內容', box(mb.x + cardPad, mb.y, Math.min(mx, mb.right) - mb.x - cardPad, mergeH), mb, '匯流帶', '縮短模組膠囊文字');
    afterCards = mb.bottom;
  }

  // ---------------------------------------------------------------- 結論帶
  if (D.conclude) {
    const col = P.hue(D.conclude.color || 'blue');
    const cb = box(M, afterCards + gapBand, CW, cclH);
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
