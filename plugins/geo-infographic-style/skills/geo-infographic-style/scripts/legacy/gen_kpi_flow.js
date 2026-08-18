// ⚠ 已凍結:本檔為舊版手寫座標生成器,僅供對照參考。新版型請寫 templates/ 模板(見 references/engine.md)。
// [生成器] 族① KPI 大數字卡列 + 系統流程帶 + 結論帶(16:9 簡報內頁)。
// Style pack: GEOX 深藍風(references/style-packs/geox-navy.md)+ 五層頁面模型(references/deck-anatomy.md)。
// 換案子只改下方 DATA。字級一律取自 page_modes 的 16x9 欄(style-spec §6.1),不得寫死。
// 用法: node gen_kpi_flow.js <out.svg> [level 1-3] [assetsDir]
const fs = require('fs'), path = require('path');
const { mode } = require('../page_modes');
const MD = mode('16x9'), T = MD.type;
const OUT = process.argv[2] || 'kpi-flow.svg';
const LEVEL = parseInt(process.argv[3] || '2', 10);
const ASSETS = process.argv[4] || './geo-assets';

// ============================ 資料 ============================
const DATA = {
  title: '數位化普及，智慧決策待突破',
  subtitle: '「有系統」不等於「資料可流動、決策可智慧化」',
  kpis: [
    {
      color: 'blue', pill: '已有', value: '28', unit: '%', icon: 'factory',
      desc: ['臺灣電子資訊製造業', '已進入AI實踐階段'],
      note: [[{ t: '另有' }, { t: '46%', hi: true }, { t: '正在規劃導入AI' }]],
      source: '資策會MIC｜2024年11月｜316份有效樣本',
    },
    {
      color: 'red', pill: '高達', value: '80', unit: '%', icon: 'clipboard',
      desc: ['已進入AI實踐階段的', '業者仍面臨資料挑戰'],
      note: [], source: '資策會MIC',
    },
    {
      color: 'orange', pill: '年增', value: '59.9', unit: '%', icon: 'robot',
      desc: ['傳統製造業AI支出年增率'],
      note: [[{ t: '高達' }, { t: '90%', hi: true }, { t: '仰賴外部供應商' }]],
      source: '資策會MIC 2025',
    },
    {
      color: 'green', pill: '年均僅', value: '38.17', unit: '/100分', icon: 'dashboard',
      desc: ['1,616家臺灣企業數位成熟度'],
      note: [[{ t: '89.6%已使用數位系統｜' }], [{ t: '超過42%仍以人工傳遞供應鏈營運資訊' }]],
      source: '台經院TDX',
    },
  ],
  systems: [
    { code: 'ERP', name: '企業資源規劃', icon: 'monitor' },
    { code: 'MES', name: '製造執行系統', icon: 'robot' },
    { code: 'CRM', name: '客戶關係管理', icon: 'people' },
    { code: 'SCM', name: '供應鏈管理', icon: 'truck' },
  ],
  outcomes: [
    { color: 'orange', text: '人工傳遞與跨系統查詢', icon: 'deskwork' },
    { color: 'blue', text: '資料斷點與決策延遲', icon: 'brokenchain' },
  ],
  conclude: {
    icon: 'bulb',
    text: '系統使用率已高，但AI實踐率、資料能力與數位成熟度仍未同步提升。',
    hi: ['AI實踐率', '資料能力', '數位成熟度'],
  },
  footnote: '*本簡報內容著作權為巨鷗跨界智慧集團所有，未經許可不得任意轉載、重製、複印使用',
  page: '11',
};

// ============================ 色票 ============================
const C = {
  blue:   { main: '#1F6FD0', deep: '#12508F', band: 'xBandB', hdr: 'xHdrB', sph: 'xSphB' },
  green:  { main: '#17A673', deep: '#0E7A54', band: 'xBandG', hdr: 'xHdrG', sph: 'xSphG' },
  orange: { main: '#ED7D31', deep: '#C25A17', band: 'xBandO', hdr: 'xHdrO', sph: 'xSphO' },
  red:    { main: '#C0392B', deep: '#96271B', band: 'xBandR', hdr: 'xHdrR', sph: 'xSphR' },
  teal:   { main: '#12908F', deep: '#0B6D6C', band: 'xBandT', hdr: 'xHdrT', sph: 'xSphT' },
};
const TITLE = '#12306E', SUB = '#2B4E8C', INK = '#233251', MUT = '#6A7590', FAINT = '#8A93A8', LINE = '#DCE5F2';
const FONT = "'Noto Sans TC','Microsoft JhengHei','Noto Sans CJK TC',sans-serif";

const W = 1920, H = 1080, M = 60;
const Y = {
  title: 84, sub: 122,
  // kpiH 由最壞情況回推:膠囊 60 + 數字列 58 + 圖說塊 92 + 分隔線 8 + 補充 2 行 60 + 來源帶 68 + 內距
  kpiTop: 152, kpiH: 360,
  flowTop: 536, flowH: 262,
  cclTop: 822, cclH: 108,
  foot: 986,
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tw = (s, size) => [...String(s)].reduce((a, ch) => a + (/[\x00-\xff]/.test(ch) ? 0.55 : 1) * size, 0);
let o = []; const P = (...s) => o.push(...s);

// ============================ 圖示 ============================
const ICON = {
  factory: '<path d="M2.6 20.4V11l5.4 3.1V11l5.4 3.1V6.4h2.2l.9 14h5.1"/><path d="M2.6 20.4h18.4"/><path d="M5.6 17.4h1.6M9.6 17.4h1.6M13.6 17.4h1.6"/>',
  clipboard: '<rect x="4.6" y="3.6" width="14.8" height="17.6" rx="2"/><path d="M9 3.6V2.4h6v1.2"/><circle cx="11" cy="11.4" r="3.4"/><path d="M13.6 14l2.8 2.8"/>',
  robot: '<path d="M4.5 20.5h15"/><path d="M7.5 20.5V13l5.5-3.6 4.8 2.2"/><circle cx="7.5" cy="13" r="1.9"/><circle cx="13" cy="9.4" r="1.7"/><path d="M17.8 11.6l2.1-1.2M18.6 13.2l1.4-2.6"/>',
  dashboard: '<rect x="2.6" y="4.2" width="18.8" height="13" rx="1.8"/><path d="M8.6 20.4h6.8M12 17.2v3.2"/><path d="M6.6 13.8v-3M10 13.8V8.6"/><circle cx="16.4" cy="10.6" r="3"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="13" rx="1.8"/><path d="M9 20h6M12 17v3M6.5 13.5v-2.6M10 13.5v-4.4M13.5 13.5v-1.8M17 13.5v-5.2"/>',
  people: '<circle cx="9.2" cy="8.4" r="3.1"/><path d="M3.4 19.4c0-3.4 2.6-5.6 5.8-5.6s5.8 2.2 5.8 5.6"/><circle cx="17.2" cy="9.8" r="2.3"/><path d="M16 14.1c2.6-.3 4.6 1.7 4.6 4.6"/>',
  truck: '<path d="M2.6 6.4h11v9.8h-11z"/><path d="M13.6 9.6h4l3.8 3.4v3.2h-7.8z"/><circle cx="7" cy="18.4" r="2.1"/><circle cx="17" cy="18.4" r="2.1"/>',
  deskwork: '<rect x="7.4" y="5.6" width="13" height="9" rx="1.4"/><path d="M10.4 18.4h10M15.4 14.6v3.8"/><circle cx="4.6" cy="9" r="2.4"/><path d="M1.4 18.4c0-2.4 1.4-4 3.2-4s3.2 1.6 3.2 4"/>',
  brokenchain: '<path d="M9.4 8.2L6.6 5.4a3.6 3.6 0 10-5.1 5.1l2.8 2.8"/><path d="M14.6 15.8l2.8 2.8a3.6 3.6 0 105.1-5.1l-2.8-2.8"/><path d="M12.4 4.2l1.2 2.6M18.6 7.4l-2.4 1.6M8.4 19.6l1.4-2.6M4.2 15.4l2.6 1.2"/>',
  bulb: '<path d="M12 3.2a6.2 6.2 0 00-3.6 11.2v2.2h7.2v-2.2A6.2 6.2 0 0012 3.2z"/><path d="M9.6 19.2h4.8M10.4 21.4h3.2"/>',
};
const icon = (n, x, y, s, col, sw) =>
  `<g transform="translate(${x},${y}) scale(${(s / 24).toFixed(4)})" fill="none" stroke="${col}" stroke-width="${sw || 1.9}" stroke-linecap="round" stroke-linejoin="round">${ICON[n] || ''}</g>`;

const DEFS = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'defs.geox.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/[\s\S]*?<defs>/, '').replace(/<\/defs>[\s\S]*/, '');

// 擬 3D 徽章(level 3 有素材則改嵌素材)
function badge(cx, cy, size, col, ic, assetName) {
  const file = assetName ? path.join(ASSETS, assetName + '.png') : '';
  if (LEVEL >= 3 && assetName && fs.existsSync(file)) {
    const s = size * 1.35;
    return `<image href="${path.relative(path.dirname(OUT), file).replace(/\\/g, '/')}" x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const r = size / 2, k = size * 0.28;
  return `<g>
  <ellipse cx="${cx}" cy="${cy + r + 6}" rx="${r * 0.86}" ry="${r * 0.17}" fill="${col.deep}" opacity="0.13"/>
  <rect x="${cx - r}" y="${cy - r}" width="${size}" height="${size}" rx="${k}" fill="url(#${col.sph})" filter="url(#obj)"/>
  <rect x="${cx - r + 3}" y="${cy - r + 3}" width="${size - 6}" height="${(size - 6) * 0.46}" rx="${k * 0.8}" fill="url(#xGloss)"/>
  ${icon(ic, cx - size * 0.29, cy - size * 0.29, size * 0.58, '#FFFFFF', 1.9 * (24 / (size * 0.58)) * 0.62)}
  </g>`;
}

// ============================ 組版 ============================
P(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
P(`<defs>${DEFS}</defs>`);
P(`<rect width="${W}" height="${H}" fill="url(#gPage)"/>`);
// 底緣裝飾(不載資訊)
P(`<g opacity="0.07" stroke="#1B4F9C" fill="none" stroke-width="2">
<circle cx="1700" cy="1050" r="220"/><ellipse cx="1700" cy="1050" rx="92" ry="220"/><path d="M1480 1010h440M1500 950h400"/></g>`);
P(`<g opacity="0.075" fill="#1B4F9C"><path d="M60 1080v-40h42v-18h28v18h36v-30h24v30h50v-24h32v24h58v-44h26v44h44v-16h30v16h38v-28h22v28h56v40z"/>
<path d="M1120 1080v-64h36v-28h32v28h48v-42h26v42h42v-22h28v22h46v64z"/></g>`);

// --- L1 標題帶(左藍豎條變體) ---
P(`<rect x="${M}" y="${Y.title - 40}" width="9" height="50" rx="4.5" fill="${C.blue.main}"/>`);
P(`<text x="${M + 26}" y="${Y.title}" font-size="${T.title}" font-weight="900" fill="${TITLE}">${esc(DATA.title)}</text>`);
P(`<text x="${M + 26}" y="${Y.sub}" font-size="${T.sub}" font-weight="500" fill="${SUB}">${esc(DATA.subtitle)}</text>`);

// --- KPI 四卡 ---
const KW = (W - 2 * M - 3 * 24) / 4, KY = Y.kpiTop, KH = Y.kpiH;
DATA.kpis.forEach((k, i) => {
  const col = C[k.color], x = M + i * (KW + 24);
  P(`<rect x="${x}" y="${KY + 6}" width="${KW}" height="${KH}" rx="16" fill="${col.main}" opacity="0.14"/>`);
  P(`<rect x="${x}" y="${KY}" width="${KW}" height="${KH}" rx="16" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5" filter="url(#shadow)"/>`);
  // 膠囊(寬由內容決定)
  const pw = tw(k.pill, T.pill) + 30;
  P(`<g filter="url(#row)"><rect x="${x + 24}" y="${KY + 22}" width="${pw}" height="38" rx="12" fill="url(#${col.hdr})"/></g>`);
  P(`<text x="${x + 24 + pw / 2}" y="${KY + 48}" text-anchor="middle" font-size="${T.pill}" font-weight="700" fill="#FFFFFF">${esc(k.pill)}</text>`);
  // 大數字 + 單位:字級由「可用寬度」回推,長數值自動縮到剛好塞得下(§3.1 內容驅動,不得溢出容器)
  const vx = x + 24 + pw + 22;
  const avail = KW - 24 - pw - 22 - 24;
  const uSize = k.unit.length > 2 ? T.cardTitle : T.bigUnit;   // 長單位(如 /100分)降一級,避免吃掉數字空間
  const unitW = tw(k.unit, uSize);
  const fit = (avail - 6 - unitW) / (tw(k.value, 100) / 100);  // 100 為基準求每 px 字級的字寬
  const vSize = Math.min(T.big, Math.floor(fit));
  P(`<text x="${vx}" y="${KY + 104}" font-size="${vSize}" font-weight="900" fill="${col.main}">${esc(k.value)}</text>`);
  P(`<text x="${vx + tw(k.value, vSize) + 6}" y="${KY + 104}" font-size="${uSize}" font-weight="700" fill="${col.main}">${esc(k.unit)}</text>`);
  // 以游標往下排:圖示+說明 → 分隔線+補充行,來源帶固定貼卡底
  const srcY = KY + KH - 68;
  let cur = KY + 118;
  P(badge(x + 24 + 44, cur + 46, 88, col, k.icon, null));
  k.desc.forEach((ln, j) =>
    P(`<text x="${x + 24 + 100}" y="${cur + (k.desc.length > 1 ? 34 : 56) + j * 34}" font-size="${T.body}" font-weight="600" fill="${INK}">${esc(ln)}</text>`));
  cur += 92;
  if (k.note.length) {
    P(`<line x1="${x + 24}" y1="${cur + 8}" x2="${x + KW - 24}" y2="${cur + 8}" stroke="${LINE}" stroke-width="1.5"/>`);
    // 補充行整體置中於「分隔線 → 來源帶」之間的剩餘空間;不足時貼齊分隔線下方,寧可上緊也不壓到來源帶
    const top = cur + 16, blockH = k.note.length * 30;
    const ny = top + Math.max(0, (srcY - 10 - top - blockH) / 2) + 22;
    k.note.forEach((segs, j) => {
      let spans = '';
      segs.forEach(s => { spans += `<tspan${s.hi ? ` fill="${col.main}" font-weight="800"` : ''}>${esc(s.t)}</tspan>`; });
      P(`<text x="${x + 24}" y="${ny + j * 30}" font-size="${T.note}" font-weight="500" fill="${INK}">${spans}</text>`);
    });
  }
  // 來源帶(卡底)
  const sy = KY + KH - 68;
  P(`<rect x="${x + 16}" y="${sy}" width="${KW - 32}" height="52" rx="10" fill="url(#${col.band})" stroke="${col.main}" stroke-width="1" stroke-opacity="0.35"/>`);
  P(`<text x="${x + KW / 2}" y="${sy + 33}" text-anchor="middle" font-size="${T.note}" font-weight="600" fill="${col.deep}">${esc(k.source)}</text>`);
});

// --- 系統流程帶 ---
const FY = Y.flowTop, FH = Y.flowH;
const SW = 152, SG = 18;
const sysW = DATA.systems.length * SW + (DATA.systems.length - 1) * SG;
DATA.systems.forEach((s, i) => {
  const x = M + i * (SW + SG);
  P(`<rect x="${x}" y="${FY + 6}" width="${SW}" height="${FH}" rx="14" fill="${C.blue.main}" opacity="0.12"/>`);
  P(`<rect x="${x}" y="${FY}" width="${SW}" height="${FH}" rx="14" fill="#FFFFFF" stroke="${C.blue.main}" stroke-width="1.6" filter="url(#card2)"/>`);
  const cw = tw(s.code, T.sub) + 34;
  P(`<rect x="${x + (SW - cw) / 2}" y="${FY + 18}" width="${cw}" height="36" rx="10" fill="url(#xBandB)" stroke="${C.blue.main}" stroke-width="1.2"/>`);
  P(`<text x="${x + SW / 2}" y="${FY + 43}" text-anchor="middle" font-size="${T.sub}" font-weight="800" fill="${C.blue.deep}" letter-spacing="1">${esc(s.code)}</text>`);
  P(badge(x + SW / 2, FY + 132, 92, C.blue, s.icon, null));
  P(`<text x="${x + SW / 2}" y="${FY + FH - 26}" text-anchor="middle" font-size="${T.note}" font-weight="600" fill="${INK}">${esc(s.name)}</text>`);
});
// chevron 箭頭
function arrow(x, cy, len, grad) {
  const hw = 30, bh = 16, bw2 = len - hw;
  return `<g filter="url(#hdr)"><path d="M${x} ${cy - bh / 2}h${bw2}v${-7}l${hw} ${bh / 2 + 7}l${-hw} ${bh / 2 + 7}v${-7}h${-bw2}z" fill="url(#${grad})"/></g>`;
}
const oc = DATA.outcomes, oGap = 56, aLen = 46;
const oX0 = M + sysW + oGap, oTot = W - M - oX0 - oGap;
const oW = (oTot - 0) / 2 - oGap / 2;
oc.forEach((c, i) => {
  const col = C[c.color], x = oX0 + i * (oW + oGap);
  P(arrow(x - oGap + 5, FY + FH / 2, aLen, col.hdr));
  P(`<rect x="${x}" y="${FY + 6}" width="${oW}" height="${FH}" rx="14" fill="${col.main}" opacity="0.12"/>`);
  P(`<rect x="${x}" y="${FY}" width="${oW}" height="${FH}" rx="14" fill="url(#${col.band})" stroke="${col.main}" stroke-width="2" filter="url(#shadow)"/>`);
  P(badge(x + oW / 2, FY + 118, 116, col, c.icon, null));
  P(`<text x="${x + oW / 2}" y="${FY + FH - 34}" text-anchor="middle" font-size="${T.cardTitle}" font-weight="800" fill="${col.deep}">${esc(c.text)}</text>`);
});

// --- L5 結論帶 ---
const KY2 = Y.cclTop, KH2 = Y.cclH;
P(`<rect x="${M}" y="${KY2}" width="${W - 2 * M}" height="${KH2}" rx="14" fill="url(#xConclude)" filter="url(#shadow)"/>`);
const kBlock = 48 + 40 + tw(DATA.conclude.text, T.conclude);
const kx = M + (W - 2 * M - kBlock) / 2;
P(`<circle cx="${kx + 24}" cy="${KY2 + KH2 / 2}" r="26" fill="url(#xSphB)"/>`);
P(icon(DATA.conclude.icon, kx + 9, KY2 + KH2 / 2 - 15, 30, '#FFFFFF', 1.9));
{
  let rest = DATA.conclude.text, spans = '';
  const re = new RegExp('(' + DATA.conclude.hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
  while (rest.length) {
    const m = rest.match(re);
    if (!m) { spans += `<tspan>${esc(rest)}</tspan>`; break; }
    if (m.index > 0) spans += `<tspan>${esc(rest.slice(0, m.index))}</tspan>`;
    spans += `<tspan fill="#4FD8FF">${esc(m[1])}</tspan>`;
    rest = rest.slice(m.index + m[1].length);
  }
  P(`<text x="${kx + 90}" y="${KY2 + KH2 / 2 + 14}" font-size="${T.conclude}" font-weight="800" fill="#FFFFFF">${spans}</text>`);
}

P(`<text x="${M}" y="${Y.foot}" font-size="${T.foot}" font-weight="400" fill="${FAINT}">${esc(DATA.footnote)}</text>`);
P(`<text x="${W - M}" y="${Y.foot}" text-anchor="end" font-size="${T.foot}" font-weight="400" fill="${FAINT}">${esc(DATA.page)}</text>`);
P('</svg>');
fs.writeFileSync(OUT, o.join('\n'));
console.log('OK', OUT, `(level ${LEVEL})`);
