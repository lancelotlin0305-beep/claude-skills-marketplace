// ⚠ 已凍結:本檔為舊版手寫座標生成器,僅供對照參考。新版型請寫 templates/ 模板(見 references/engine.md)。
// [生成器] 族③ hub 資料匯流頁(來源系統 → 中央 DataHub → 決策中心 → 模組群)。
// Style pack: GEOX 深藍風(references/style-packs/geox-navy.md)+ 五層頁面模型(references/deck-anatomy.md)。
// 換案子只改下方 DATA;版面、連線、輝光全部自動長出來。
// 用法: node gen_hub_flow.js <out.svg> [level 1-3] [assetsDir]
//   level 2(預設)= SVG 擬 3D 徽章;level 3 = 若 assetsDir 有對應 G**_*.png 去背素材則改嵌入素材。
const fs = require('fs'), path = require('path');
// 本檔為【16:9 簡報內頁】模式;字級一律取自 page_modes 的 16x9 欄(style-spec §6.1),不得寫死。
const { mode } = require('../page_modes');
const MD = mode('16x9'), T = MD.type;
const OUT = process.argv[2] || 'hub-flow.svg';
const LEVEL = parseInt(process.argv[3] || '2', 10);
const ASSETS = process.argv[4] || './geo-assets';

// ============================ 資料 ============================
const DATA = {
  title: '五大痛點，AI Agent協作回應',
  subtitle: '以共通資料層打通既有系統，讓五項AI模組共享資料、協作決策',
  lead: '從分散系統，形成可治理、可擴散的營運AI決策流',
  sources: [
    { id: 'ERP', icon: 'monitor' },
    { id: 'MES', icon: 'robot' },
    { id: 'CRM', icon: 'people' },
    { id: 'SCM', icon: 'cube' },
  ],
  hub: {
    badge: '巨鷗DataHub',
    rows: [
      { icon: 'funnel', label: '匯流' },
      { icon: 'db', label: '標準化' },
      { icon: 'lock', label: '權限控管' },
    ],
  },
  stages: [
    { lines: ['AI決策中心'], sub: '模型分析與決策建議', icon: 'brain', asset: 'G02_ai-brain-hex', tone: 'light' },
    { lines: ['五項AI', '模組協作'], icon: 'puzzle', asset: 'G03_puzzle-modules', tone: 'dark' },
  ],
  // 色彩依 geox-navy.md §4 canonical 綁定(訂單藍/採購橘/定價綠/KM紫/客服青綠)
  modules: [
    { lines: ['訂單智慧', '預測模組'], color: 'blue', icon: 'chart', asset: 'G04_forecast-chart' },
    { lines: ['採購成本', '最佳化模組'], color: 'orange', icon: 'cart', asset: 'G05_procure-cart' },
    { lines: ['動態接單', '定價模組'], color: 'green', icon: 'tag', asset: 'G06_pricing-tag' },
    { lines: ['企業KM', '知識家'], color: 'purple', icon: 'book', asset: 'G07_km-book' },
    { lines: ['智能客服', '代理人'], color: 'teal', icon: 'headset', asset: 'G08_support-headset' },
  ],
  capabilities: [
    { icon: 'api', text: '統一API規範' },
    { icon: 'gearpeople', text: '系統商無須修改核心產品' },
    { icon: 'shield', text: '避免重複客製' },
    { icon: 'serverlock', text: '可依資安需求彈性部署' },
  ],
  conclude: {
    icon: 'bulb',
    text: '不是五套獨立工具，而是一個可負擔、可治理、可複製的營運AI基礎層',
    hi: ['可負擔', '可治理', '可複製'],
  },
  footnote: '*本簡報內容著作權為巨鷗跨界智慧集團所有，未經許可不得任意轉載、重製、複印使用',
  page: '13',
};

// ============================ 色票 ============================
const C = {
  blue:   { main: '#1F6FD0', deep: '#12508F', light: '#EFF6FF', edge: '#CFE2F8', sph: 'xSphB', hdr: 'xHdrB' },
  green:  { main: '#17A673', deep: '#0E7A54', light: '#EFFAF5', edge: '#C9EDDD', sph: 'xSphG', hdr: 'xHdrG' },
  orange: { main: '#ED7D31', deep: '#C25A17', light: '#FFF6EF', edge: '#F9DCC5', sph: 'xSphO', hdr: 'xHdrO' },
  purple: { main: '#7C4DBC', deep: '#5C3496', light: '#F6F2FD', edge: '#E0D3F4', sph: 'xSphP', hdr: 'xHdrP' },
  teal:   { main: '#12908F', deep: '#0B6D6C', light: '#EEF9F9', edge: '#C7E8E7', sph: 'xSphT', hdr: 'xHdrT' },
};
const TITLE = '#12306E', SUB = '#2B4E8C', INK = '#233251', MUT = '#6A7590', FAINT = '#8A93A8',
      LINE = '#DCE5F2', CYAN = '#29C5F6', FLOW = '#3FC8F5';
const FONT = "'Noto Sans TC','Microsoft JhengHei','Noto Sans CJK TC',sans-serif";

const W = 1920, H = 1080, M = 60;
// ---------- 統一欄系統(主流程列與模組列共用同一組邊界,消除「近失對齊」) ----------
// 5 欄:卡寬 320、間距 50。主流程列的四個區塊各自吸附到這些欄邊,箭頭走 50px 通道。
const COLW = 320, COLG = 50;
const COL = i => M + i * (COLW + COLG);                 // 60 / 430 / 800 / 1170 / 1540
const BLK = {
  src:   { x: COL(0), w: COLW * 2 + COLG },             //   60 – 750(佔兩欄,內含 4 磚)
  hub:   { x: COL(2), w: COLW },                        //  800 – 1120,中心 960 = 版心
  st1:   { x: COL(3), w: COLW },                        // 1170 – 1490
  st2:   { x: COL(4), w: COLW },                        // 1540 – 1860
};
// ---------- 垂直節奏:帶與帶之間一律 20px,不留可被辨識為斷帶的空隙 ----------
const Y = {
  title: 84, sub: 116, lead: 172,                        // 導言句與 hub 膠囊同一水平帶
  // 尺度層級:磚 176 < 階段卡 210 < 圓柱 226(+台座)。三者底部漸次下探,右半不留空檔。
  rowTop: 198, rowH: 176, stageH: 210,
  hubH: 218, padCy: 452,                                 // 柱身高 = 膠囊堆疊 190 + 上下各 14;padCy = 台座下層中心
  modTop: 556, modH: 152,                                // 模組卡(收緊,圖示同步放大)
  capTop: 728, capH: 96,                                 // 共通能力帶(高度配合放大的圖示徽)
  cclTop: 844, cclH: 106,                                // 結論帶
  foot: 1000,
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 中文字寬 ≈ 字級,半形 ≈ 0.55 字級
const tw = (s, size) => [...String(s)].reduce((a, ch) => a + (/[\x00-\xff]/.test(ch) ? 0.55 : 1) * size, 0);
let o = []; const P = (...s) => o.push(...s);

// ============================ 圖示(24×24 線稿) ============================
const ICON = {
  monitor: '<rect x="2.5" y="4" width="19" height="13" rx="1.8"/><path d="M9 20h6M12 17v3M6.5 13.5v-2.6M10 13.5v-4.4M13.5 13.5v-1.8M17 13.5v-5.2"/>',
  robot: '<path d="M4.5 20.5h15"/><path d="M7.5 20.5V13l5.5-3.6 4.8 2.2"/><circle cx="7.5" cy="13" r="1.9"/><circle cx="13" cy="9.4" r="1.7"/><path d="M17.8 11.6l2.1-1.2M18.6 13.2l1.4-2.6"/><path d="M5.6 20.5v-1.6h3.8v1.6"/>',
  people: '<circle cx="9.2" cy="8.4" r="3.1"/><path d="M3.4 19.4c0-3.4 2.6-5.6 5.8-5.6s5.8 2.2 5.8 5.6"/><circle cx="17.2" cy="9.8" r="2.3"/><path d="M16 14.1c2.6-.3 4.6 1.7 4.6 4.6"/>',
  cube: '<path d="M12 2.9l8.2 4.4v9.4L12 21.1 3.8 16.7V7.3z"/><path d="M3.8 7.3L12 11.7l8.2-4.4M12 11.7v9.4"/>',
  funnel: '<path d="M3.6 4.6h16.8l-6.4 8v6.1l-4 2.4v-8.5z"/>',
  db: '<ellipse cx="12" cy="6.2" rx="7.2" ry="3.1"/><path d="M4.8 6.2v11.6c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1V6.2"/><path d="M4.8 12c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1"/>',
  lock: '<rect x="4.6" y="10.3" width="14.8" height="9.6" rx="2.2"/><path d="M8.2 10.3V7.8a3.8 3.8 0 017.6 0v2.5"/><circle cx="12" cy="14.8" r="1.5"/>',
  chart: '<path d="M3.6 20.2h16.8"/><path d="M6.4 20.2v-6.1M11 20.2V9.3M15.6 20.2v-4M20.2 20.2V5.4"/>',
  cart: '<path d="M2.8 4.2h2.9l2.6 10.4h9.3l2.3-7.6H7.1"/><circle cx="9.6" cy="19" r="1.7"/><circle cx="17.4" cy="19" r="1.7"/>',
  tag: '<path d="M11.4 3.1H4.2a1 1 0 00-1 1v7.2a1 1 0 00.3.7l8.6 8.6a1 1 0 001.4 0l7.2-7.2a1 1 0 000-1.4L12.1 3.4a1 1 0 00-.7-.3z"/><circle cx="7.9" cy="7.8" r="1.7"/>',
  book: '<path d="M12 5.6C9.6 4 6.6 3.8 3.7 4.9v13.4c2.9-1.1 5.9-.9 8.3.7"/><path d="M12 5.6c2.4-1.6 5.4-1.8 8.3-.7v13.4c-2.9-1.1-5.9-.9-8.3.7z"/><path d="M12 5.6V20"/>',
  headset: '<path d="M4.6 14.6v-2.4a7.4 7.4 0 0114.8 0v2.4"/><rect x="2.9" y="13.4" width="4.2" height="6.4" rx="2.1"/><rect x="16.9" y="13.4" width="4.2" height="6.4" rx="2.1"/><path d="M19 19.8v.6c0 1.2-1 2.2-2.2 2.2h-2.3"/>',
  brain: '<path d="M12 4.2c-1.9-1.4-5.1-.7-5.7 1.8-1.9.4-2.8 2.3-2.1 3.9-1.4 1.3-1.2 3.6.5 4.5-.3 2 1.4 3.6 3.3 3.3.7 1.7 3.1 2.2 4 .5z"/><path d="M12 4.2c1.9-1.4 5.1-.7 5.7 1.8 1.9.4 2.8 2.3 2.1 3.9 1.4 1.3 1.2 3.6-.5 4.5.3 2-1.4 3.6-3.3 3.3-.7 1.7-3.1 2.2-4 .5z"/><path d="M12 4.2v14M8.6 8.6h2.2M13.2 11.4h2.4M9.2 13.6h1.8"/>',
  puzzle: '<path d="M4 4.6h5.4a1.8 1.8 0 113.6 0H20v5.6a1.8 1.8 0 100 3.6V20h-6.8a1.8 1.8 0 10-3.6 0H4z"/>',
  api: '<path d="M9.2 3.6c-2 0-3 1-3 3v2.1c0 1.5-1 2.5-2 3 1 .5 2 1.5 2 3v2.1c0 2 1 3 3 3"/><path d="M14.8 3.6c2 0 3 1 3 3v2.1c0 1.5 1 2.5 2 3-1 .5-2 1.5-2 3v2.1c0 2-1 3-3 3"/><circle cx="12" cy="11.8" r="1.5"/>',
  gearpeople: '<circle cx="8.6" cy="10.4" r="3.4"/><path d="M8.6 4.4v2M8.6 14.4v2M2.6 10.4h2M12.6 10.4h2M4.4 6.2l1.4 1.4M11.4 13.2l1.4 1.4M12.8 6.2l-1.4 1.4M5.8 13.2l-1.4 1.4"/><circle cx="17.4" cy="10.2" r="2.6"/><path d="M12.8 20.4c0-2.9 2.1-4.8 4.6-4.8s4.6 1.9 4.6 4.8"/>',
  shield: '<path d="M12 3.1l8 3v6.1c0 5-3.5 8.1-8 9.2-4.5-1.1-8-4.2-8-9.2V6.1z"/><path d="M8.4 12.1l2.6 2.6 4.8-5"/>',
  serverlock: '<rect x="3.2" y="4.1" width="17.6" height="5" rx="1.4"/><rect x="3.2" y="11" width="11" height="5" rx="1.4"/><path d="M6.4 6.6h.02M6.4 13.5h.02"/><rect x="14.6" y="16.2" width="6.4" height="4.6" rx="1.1"/><path d="M16.2 16.2v-1.4a1.6 1.6 0 013.2 0v1.4"/>',
  bulb: '<path d="M12 3.2a6.2 6.2 0 00-3.6 11.2v2.2h7.2v-2.2A6.2 6.2 0 0012 3.2z"/><path d="M9.6 19.2h4.8M10.4 21.4h3.2"/>',
};
const icon = (name, x, y, size, color, sw) =>
  `<g transform="translate(${x},${y}) scale(${(size / 24).toFixed(4)})" fill="none" stroke="${color}" stroke-width="${sw || 1.9}" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ''}</g>`;

// ============================ defs ============================
// 先剝掉註解再抽 defs 內容——註解裡若出現標籤字樣會咬錯位置。
const DEFS = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'defs.geox.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/[\s\S]*?<defs>/, '').replace(/<\/defs>[\s\S]*/, '');

// ============================ 元件 ============================
// 擬 3D 徽章:球面圓角方塊 + 白線圖示 + 頂部反光 + 地面陰影(level 3 有素材則改嵌素材)
function badge(cx, cy, size, col, ic, assetName) {
  const file = path.join(ASSETS, assetName + '.png');
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

// 深色系統磚
function tile(x, y, w, h, s) {
  return `<g>
  <rect x="${x}" y="${y + 6}" width="${w}" height="${h}" rx="16" fill="#0E2A5C" opacity="0.16"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="url(#xTile)" filter="url(#shadow)"/>
  <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h * 0.42}" rx="13" fill="url(#xGloss)"/>
  <rect x="${x + 0.75}" y="${y + 0.75}" width="${w - 1.5}" height="${h - 1.5}" rx="15.3" fill="none" stroke="${CYAN}" stroke-width="1.5" opacity="0.45"/>
  ${icon(s.icon, x + w / 2 - 40, y + 26, 80, '#FFFFFF', 1.6)}
  <text x="${x + w / 2}" y="${y + h - 26}" text-anchor="middle" font-family="${FONT}" font-size="${T.tile}" font-weight="800" fill="#FFFFFF" letter-spacing="1">${esc(s.id)}</text>
  </g>`;
}

// 發光落地平台
function pad(cx, cy, rx, ry) {
  return `<g>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#xGlowPad)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.72}" ry="${ry * 0.72}" fill="none" stroke="${CYAN}" stroke-width="1.6" opacity="0.3"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.44}" ry="${ry * 0.44}" fill="none" stroke="${CYAN}" stroke-width="1.2" opacity="0.2"/>
  </g>`;
}

// 台座單層:上層面橢圓 + 側壁(做出厚度)。由下而上依序呼叫,大在下小在上。
function tier(cx, cy, rx, ry, t) {
  return `<g>
  <path d="M${cx - rx} ${cy} v${t} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-t} z" fill="url(#xTierSide)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#xTierTop)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${CYAN}" stroke-width="1.8" opacity="0.55"/>
  <ellipse cx="${cx}" cy="${cy + t}" rx="${rx}" ry="${ry}" fill="none" stroke="${CYAN}" stroke-width="1.2" opacity="0.28"
    clip-path="none" stroke-dasharray="${rx * 3.14} ${rx * 3.14}" stroke-dashoffset="0"/>
  </g>`;
}

// chevron 箭頭
function arrow(x, cy, len, grad) {
  const hw = 30, bh = 16, bx = x, bw = len - hw;
  return `<g filter="url(#hdr)"><path d="M${bx} ${cy - bh / 2}h${bw}v${-7}l${hw} ${bh / 2 + 7}l${-hw} ${bh / 2 + 7}v${-7}h${-bw}z" fill="url(#${grad})"/></g>`;
}

// DataHub 圓柱
function cylinder(cx, top, rx, bodyH, rows) {
  const ry = rx * 0.215, bot = top + bodyH;
  let g = `<g filter="url(#shadow)">
  <path d="M${cx - rx} ${top} v${bodyH} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-bodyH}z" fill="url(#xCylBody)"/>
  <ellipse cx="${cx}" cy="${bot}" rx="${rx}" ry="${ry}" fill="#0A2047" opacity="0.55"/>
  <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="url(#xCylTop)"/>
  <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="none" stroke="${CYAN}" stroke-width="1.6" opacity="0.6"/>
  <path d="M${cx - rx} ${top} v${bodyH}" stroke="${CYAN}" stroke-width="2" opacity="0.5" fill="none"/>
  <path d="M${cx + rx} ${top} v${bodyH}" stroke="${CYAN}" stroke-width="2" opacity="0.5" fill="none"/>
  </g>`;
  // 膠囊寬度由「最長標籤的內容」決定,不從圓柱半徑推——後者會讓短標籤右側固定空一大塊。
  // 內容 = 內距 24 + 圓形圖示徽 42 + 間距 16 + 最長標籤 + 內距 24;膠囊約佔柱寬 86%(對齊原簡報)。
  // 堆疊間隙刻意壓到 8(約膠囊高 14%):原簡報三條幾乎相連,間隙一大就顯得柱身空。
  const FS = T.cardTitle, BR = 21, PAD = 24, GAPX = 16, RAD = 16;
  const rw = PAD + BR * 2 + GAPX + Math.max(...rows.map(r => tw(r.label, FS))) + PAD;
  const rh = 58, gap = 8;
  const totalH = rows.length * rh + (rows.length - 1) * gap;
  let ry0 = top + (bodyH - totalH) / 2;
  rows.forEach(r => {
    const rx0 = cx - rw / 2;
    g += `<g filter="url(#row)">
    <rect x="${rx0}" y="${ry0}" width="${rw}" height="${rh}" rx="${RAD}" fill="#0B2650" opacity="0.82"/>
    <rect x="${rx0}" y="${ry0}" width="${rw}" height="${rh}" rx="${RAD}" fill="none" stroke="${CYAN}" stroke-width="1.2" opacity="0.5"/>
    <circle cx="${rx0 + PAD + BR}" cy="${ry0 + rh / 2}" r="${BR}" fill="url(#xSphB)"/>
    ${icon(r.icon, rx0 + PAD + BR - 12, ry0 + rh / 2 - 12, 24, '#FFFFFF', 2.0)}
    <text x="${rx0 + PAD + BR * 2 + GAPX}" y="${ry0 + rh / 2 + 9}" font-family="${FONT}" font-size="${FS}" font-weight="700" fill="#FFFFFF">${esc(r.label)}</text>
    </g>`;
    ry0 += rh + gap;
  });
  return g;
}

// ============================ 組版 ============================
P(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
P(`<defs>${DEFS}</defs>`);

// --- L0 底圖 ---
P(`<rect width="${W}" height="${H}" fill="url(#gPage)"/>`);
// 標題帶右側裝飾:柔光圓 + 電路紋 + 點陣。填補標題右方的大片空白(不載資訊、置於內容層下)
P(`<g opacity="0.55">
<circle cx="1215" cy="66" r="72" fill="#DFEAFA"/><circle cx="1452" cy="104" r="96" fill="#E4EEFB"/>
<circle cx="1712" cy="58" r="82" fill="#DCE9FB"/><circle cx="1610" cy="140" r="54" fill="#E7F1FD"/>
</g>`);
P(`<g opacity="0.5" stroke="#A9C4E8" fill="none" stroke-width="2" stroke-linecap="round">
<path d="M1020 138h96l30-30h120l26 26h108"/><path d="M1120 44h140l28 28h132"/>
<path d="M1400 150h150l34-34h130"/><path d="M1520 40h96l26 26h150"/>
<path d="M1290 96h110l24 24h180"/></g>`);
P(`<g fill="#8FB0DC" opacity="0.55">`);
[[1116, 138], [1272, 108], [1370, 134], [1260, 44], [1288, 72], [1420, 72], [1550, 150], [1584, 116], [1714, 116], [1616, 40], [1642, 66], [1792, 66], [1400, 96], [1424, 120], [1604, 120]]
  .forEach(([x, y]) => P(`<circle cx="${x}" cy="${y}" r="4" />`));
P(`</g>`);
P(`<g opacity="0.5">`);
for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++)
  P(`<circle cx="${1700 + i * 26}" cy="${172 + j * 24}" r="2.4" fill="#9DB4DC" opacity="0.5"/>`);
P(`</g>`);
// 右下地球經緯弧(裝飾,不載資訊)
P(`<g opacity="0.07" stroke="#1B4F9C" fill="none" stroke-width="2">
<circle cx="1690" cy="1040" r="230"/><circle cx="1690" cy="1040" r="230" transform="rotate(-12 1690 1040)"/>
<ellipse cx="1690" cy="1040" rx="96" ry="230"/><ellipse cx="1690" cy="1040" rx="180" ry="230"/>
<path d="M1460 1000h460M1478 940h424M1512 880h356"/></g>`);
// 底緣天際線剪影,橫貫全寬填補底部空帶
P(`<g opacity="0.075" fill="#1B4F9C"><path d="M60 1080v-42h44v-20h30v20h38v-34h26v34h52v-26h34v26h60v-48h28v48h46v-18h32v18h40v-30h24v30h58v42z"/>
<path d="M640 1080v-56h40v-24l30-16 30 16v24h34v-40h26v40h48v-22h30v22h52v56z"/>
<path d="M1080 1080v-70h38v-30h34v30h50v-46h28v46h44v-24h30v24h48v70z"/>
<path d="M1420 1080v-84h46v-34h32v34h60v-24h26v24h36v-40h28v40h50v84z"/></g>`);

// --- L1 標題帶 ---
P(`<text x="${M}" y="${Y.title}" font-size="${T.title}" font-weight="900" fill="${TITLE}">${esc(DATA.title)}</text>`);
P(`<text x="${M}" y="${Y.sub}" font-size="${T.sub}" font-weight="500" fill="${SUB}">${esc(DATA.subtitle)}</text>`);

// --- 主流程列(導言句與 hub 膠囊同一水平帶,不另開一行) ---
const RY = Y.rowTop, RH = Y.rowH, ROW_CY = RY + RH / 2;
P(`<text x="${M}" y="${Y.lead}" font-size="${T.lead}" font-weight="800" fill="${TITLE}">${esc(DATA.lead)}</text>`);

// 來源系統磚:寬由「圖示 80 或代號寬」取大者 + 左右內距 28 決定(§3.1 容器尺寸由內容決定);
// 間距由 src 區塊寬回推,讓群組兩端仍吸附欄邊 —— 內容決定尺寸、版面決定位置。
const TW = Math.max(80, Math.max(...DATA.sources.map(s => tw(s.id, 24) + 2))) + 56;
const TG = (BLK.src.w - DATA.sources.length * TW) / (DATA.sources.length - 1), TY = RY;
P(pad(BLK.src.x + BLK.src.w / 2, RY + RH + 24, 330, 28));
DATA.sources.forEach((s, i) => P(tile(BLK.src.x + i * (TW + TG), TY, TW, RH, s)));

P(arrow(BLK.src.x + BLK.src.w + 3, ROW_CY, 44, 'xHdrB'));

// DataHub 圓柱:區塊中心 = 版心 960
const HCX = BLK.hub.x + BLK.hub.w / 2;
// 台座:發光底 + 兩層實體圓台(有厚度),由大而小疊上來,承住圓柱
P(pad(HCX, Y.padCy + 12, 212, 34));
P(tier(HCX, Y.padCy, 180, 28, 12));
P(tier(HCX, Y.padCy - 12, 146, 24, 10));
// 柱半徑配合膠囊寬度(膠囊約佔柱寬 86%),避免柱身左右出現無用的深色空塗
P(cylinder(HCX, RY + 16, 122, Y.hubH, DATA.hub.rows));
// 橘膠囊為「貼標」語彙:刻意壓在柱頂上緣(覆蓋頂蓋上半),故畫在圓柱之後。
// 此為 §3.1 淨距規則的例外——貼標與被貼物本就該重疊,不適用 ≥12 淨距。
const bw = tw(DATA.hub.badge, 24) + 52;
const badgeY = RY + 16 - 44;                             // 底緣正好落在柱頂橢圓中線,與第一條膠囊淨距 14
P(`<g filter="url(#hdr)"><rect x="${HCX - bw / 2}" y="${badgeY}" width="${bw}" height="44" rx="22" fill="url(#xHdrO)"/></g>`);
P(`<text x="${HCX}" y="${badgeY + 30}" text-anchor="middle" font-size="${T.tile}" font-weight="800" fill="#FFFFFF">${esc(DATA.hub.badge)}</text>`);

P(arrow(BLK.hub.x + BLK.hub.w + 3, ROW_CY, 44, 'xHdrB'));

// 階段卡
const ST = [BLK.st1, BLK.st2];
DATA.stages.forEach((st, i) => {
  const { x, w } = ST[i], y = RY, h = Y.stageH;
  if (st.tone === 'dark') {
    P(`<rect x="${x}" y="${y + 6}" width="${w}" height="${h}" rx="16" fill="#0E2A5C" opacity="0.16"/>`);
    P(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="url(#xTile)" filter="url(#shadow)"/>`);
    P(`<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h * 0.4}" rx="13" fill="url(#xGloss)"/>`);
  } else {
    P(`<rect x="${x}" y="${y + 6}" width="${w}" height="${h}" rx="16" fill="${C.blue.main}" opacity="0.16"/>`);
    P(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="url(#xBandB)" stroke="${C.blue.main}" stroke-width="2" filter="url(#shadow)"/>`);
  }
  // 徽章 104(非 116):副行放大到 T.sub 後,需讓出寬度才能維持右內距 ≥16(§3.1)
  const stw = Math.max(...st.lines.map(l => tw(l, T.cardTitle)), st.sub ? tw(st.sub, T.sub) : 0);
  const sbx = x + (w - (104 + 18 + stw)) / 2;
  P(badge(sbx + 52, y + h / 2, 104, C.blue, st.icon, st.asset));
  const tx = sbx + 122, ink = st.tone === 'dark' ? '#FFFFFF' : TITLE;
  if (st.sub) {
    P(`<text x="${tx}" y="${y + h / 2 - 4}" font-size="${T.cardTitle}" font-weight="800" fill="${ink}">${esc(st.lines[0])}</text>`);
    P(`<text x="${tx}" y="${y + h / 2 + 28}" font-size="${T.sub}" font-weight="500" fill="${st.tone === 'dark' ? '#C9DCF5' : MUT}">${esc(st.sub)}</text>`);
  } else {
    st.lines.forEach((ln, k) => P(`<text x="${tx}" y="${y + h / 2 - 8 + k * 36}" font-size="${T.cardTitle}" font-weight="800" fill="${ink}">${esc(ln)}</text>`));
  }
});
P(arrow(BLK.st1.x + BLK.st1.w + 3, ROW_CY, 44, 'xHdrB'));

// --- 模組列 + 發光匯流曲線(共用同一組欄邊) ---
const MW = COLW, MY = Y.modTop, MH = Y.modH;
const mcx = i => COL(i) + MW / 2;
DATA.modules.forEach((m, i) => {
  const sx = HCX, sy = Y.padCy + 32, ex = mcx(i), ey = MY;   // 起點藏在台座發光下緣
  P(`<path d="M${sx} ${sy} C ${sx} ${sy + 62}, ${ex} ${ey - 76}, ${ex} ${ey}" fill="none" stroke="${FLOW}" stroke-width="2.6" opacity="0.9" filter="url(#glow)"/>`);
  P(`<circle cx="${ex}" cy="${ey}" r="4.5" fill="${FLOW}"/>`);
});
P(`<circle cx="${HCX}" cy="${Y.padCy + 32}" r="5.5" fill="${FLOW}" filter="url(#glow)"/>`);

DATA.modules.forEach((m, i) => {
  const col = C[m.color], x = COL(i);
  P(`<rect x="${x}" y="${MY + 6}" width="${MW}" height="${MH}" rx="14" fill="${col.main}" opacity="0.16"/>`);
  P(`<rect x="${x}" y="${MY}" width="${MW}" height="${MH}" rx="14" fill="url(#x${{ blue: 'BandB', green: 'BandG', orange: 'BandO', purple: 'BandP', teal: 'BandT' }[m.color]})" stroke="${col.main}" stroke-width="2" filter="url(#shadow)"/>`);
  // 圖文區塊在卡內置中,避免右半大片留白(style-spec §3.1 留白判準③)
  const twMax = Math.max(...m.lines.map(l => tw(l, 26)));
  const bx = x + (MW - (120 + 14 + twMax)) / 2;
  P(badge(bx + 60, MY + MH / 2, 120, col, m.icon, m.asset));
  m.lines.forEach((ln, k) =>
    P(`<text x="${bx + 134}" y="${MY + 68 + k * 38}" font-size="${T.cardTitle}" font-weight="800" fill="${col.deep}">${esc(ln)}</text>`));
});

// --- 共通能力橫帶 ---
const CY0 = Y.capTop, CH = Y.capH, cellW = (W - 2 * M) / DATA.capabilities.length;
P(`<rect x="${M}" y="${CY0}" width="${W - 2 * M}" height="${CH}" rx="14" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5" filter="url(#card2)"/>`);
DATA.capabilities.forEach((c, i) => {
  // 分佈帶:項目本身內容驅動並等距分佈,帶寬由版面決定(§3.1 例外②)
  const cellX = M + i * cellW, textW = tw(c.text, 24), blockW = 64 + 18 + textW;
  const bx = cellX + (cellW - blockW) / 2;
  if (i > 0) P(`<line x1="${cellX}" y1="${CY0 + 16}" x2="${cellX}" y2="${CY0 + CH - 16}" stroke="${LINE}" stroke-width="1"/>`);
  P(`<circle cx="${bx + 32}" cy="${CY0 + CH / 2}" r="32" fill="url(#xSphB)" filter="url(#row)"/>`);
  P(icon(c.icon, bx + 13, CY0 + CH / 2 - 19, 38, '#FFFFFF', 1.6));
  P(`<text x="${bx + 82}" y="${CY0 + CH / 2 + 9}" font-size="${T.tile}" font-weight="600" fill="${INK}">${esc(c.text)}</text>`);
});

// --- L5 結論帶 ---
const KY = Y.cclTop, KH = Y.cclH;
P(`<rect x="${M}" y="${KY}" width="${W - 2 * M}" height="${KH}" rx="14" fill="url(#xConclude)" filter="url(#shadow)"/>`);
// 徽章 + 結論句整體置中
const kBlock = 48 + 40 + tw(DATA.conclude.text, 38);
const kx = M + (W - 2 * M - kBlock) / 2;
P(`<circle cx="${kx + 24}" cy="${KY + KH / 2}" r="24" fill="url(#xSphB)"/>`);
P(icon(DATA.conclude.icon, kx + 10, KY + KH / 2 - 14, 28, '#FFFFFF', 1.9));
{
  let rest = DATA.conclude.text, spans = '';
  const re = new RegExp('(' + DATA.conclude.hi.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
  while (rest.length) {
    const m2 = rest.match(re);
    if (!m2) { spans += `<tspan>${esc(rest)}</tspan>`; break; }
    if (m2.index > 0) spans += `<tspan>${esc(rest.slice(0, m2.index))}</tspan>`;
    spans += `<tspan fill="#4FD8FF">${esc(m2[1])}</tspan>`;
    rest = rest.slice(m2.index + m2[1].length);
  }
  P(`<text x="${kx + 88}" y="${KY + KH / 2 + 14}" font-size="${T.conclude}" font-weight="800" fill="#FFFFFF">${spans}</text>`);
}

// --- 註腳 ---
P(`<text x="${M}" y="${Y.foot}" font-size="${T.foot}" font-weight="400" fill="${FAINT}">${esc(DATA.footnote)}</text>`);
P(`<text x="${W - M}" y="${Y.foot}" text-anchor="end" font-size="${T.foot}" font-weight="400" fill="${FAINT}">${esc(DATA.page)}</text>`);

P('</svg>');
fs.writeFileSync(OUT, o.join('\n'));
console.log('OK', OUT, `(level ${LEVEL})`);
