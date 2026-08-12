// [核心] 線稿圖示庫。全部以 24×24 viewBox、stroke-based 繪製,由呼叫端指定顏色與線寬。
// 原本 gen_hub_flow.js 與 gen_kpi_flow.js 各自重複一份;統一於此,並提供 fallback——
// 查不到的圖示回傳中性幾何形而非空白(舊行為是靜默留白)。
const PATHS = {
  // 系統 / 裝置
  monitor:     '<rect x="2.5" y="4" width="19" height="13" rx="1.8"/><path d="M9 20h6M12 17v3M6.5 13.5v-2.6M10 13.5v-4.4M13.5 13.5v-1.8M17 13.5v-5.2"/>',
  dashboard:   '<rect x="2.6" y="4.2" width="18.8" height="13" rx="1.8"/><path d="M8.6 20.4h6.8M12 17.2v3.2"/><path d="M6.6 13.8v-3M10 13.8V8.6"/><circle cx="16.4" cy="10.6" r="3"/>',
  serverrack:  '<rect x="3.2" y="4.1" width="17.6" height="5" rx="1.4"/><rect x="3.2" y="11" width="17.6" height="5" rx="1.4"/><path d="M6.4 6.6h.02M6.4 13.5h.02"/><path d="M8.6 20.4h6.8"/>',
  serverlock:  '<rect x="3.2" y="4.1" width="17.6" height="5" rx="1.4"/><rect x="3.2" y="11" width="11" height="5" rx="1.4"/><path d="M6.4 6.6h.02M6.4 13.5h.02"/><rect x="14.6" y="16.2" width="6.4" height="4.6" rx="1.1"/><path d="M16.2 16.2v-1.4a1.6 1.6 0 013.2 0v1.4"/>',
  cloud:       '<path d="M6.6 17.4a4 4 0 01.5-7.97 5.4 5.4 0 0110.4 1.3 3.4 3.4 0 01-.6 6.67z"/><path d="M8.6 20.8h6.8"/>',
  // 製造 / 物流
  robot:       '<path d="M4.5 20.5h15"/><path d="M7.5 20.5V13l5.5-3.6 4.8 2.2"/><circle cx="7.5" cy="13" r="1.9"/><circle cx="13" cy="9.4" r="1.7"/><path d="M17.8 11.6l2.1-1.2M18.6 13.2l1.4-2.6"/><path d="M5.6 20.5v-1.6h3.8v1.6"/>',
  factory:     '<path d="M2.6 20.4V11l5.4 3.1V11l5.4 3.1V6.4h2.2l.9 14h5.1"/><path d="M2.6 20.4h18.4"/><path d="M5.6 17.4h1.6M9.6 17.4h1.6M13.6 17.4h1.6"/>',
  truck:       '<path d="M2.6 6.4h11v9.8h-11z"/><path d="M13.6 9.6h4l3.8 3.4v3.2h-7.8z"/><circle cx="7" cy="18.4" r="2.1"/><circle cx="17" cy="18.4" r="2.1"/>',
  cube:        '<path d="M12 2.9l8.2 4.4v9.4L12 21.1 3.8 16.7V7.3z"/><path d="M3.8 7.3L12 11.7l8.2-4.4M12 11.7v9.4"/>',
  cart:        '<path d="M2.8 4.2h2.9l2.6 10.4h9.3l2.3-7.6H7.1"/><circle cx="9.6" cy="19" r="1.7"/><circle cx="17.4" cy="19" r="1.7"/>',
  // 資料 / 治理
  funnel:      '<path d="M3.6 4.6h16.8l-6.4 8v6.1l-4 2.4v-8.5z"/>',
  db:          '<ellipse cx="12" cy="6.2" rx="7.2" ry="3.1"/><path d="M4.8 6.2v11.6c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1V6.2"/><path d="M4.8 12c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1"/>',
  lock:        '<rect x="4.6" y="10.3" width="14.8" height="9.6" rx="2.2"/><path d="M8.2 10.3V7.8a3.8 3.8 0 017.6 0v2.5"/><circle cx="12" cy="14.8" r="1.5"/>',
  shield:      '<path d="M12 3.1l8 3v6.1c0 5-3.5 8.1-8 9.2-4.5-1.1-8-4.2-8-9.2V6.1z"/><path d="M8.4 12.1l2.6 2.6 4.8-5"/>',
  api:         '<path d="M9.2 3.6c-2 0-3 1-3 3v2.1c0 1.5-1 2.5-2 3 1 .5 2 1.5 2 3v2.1c0 2 1 3 3 3"/><path d="M14.8 3.6c2 0 3 1 3 3v2.1c0 1.5 1 2.5 2 3-1 .5-2 1.5-2 3v2.1c0 2-1 3-3 3"/><circle cx="12" cy="11.8" r="1.5"/>',
  doc:         '<path d="M6 2.8h7.6L19 8.2v13H6z"/><path d="M13.6 2.8v5.4H19"/><path d="M8.8 12.4h7.4M8.8 15.6h7.4M8.8 18.4h4.6"/>',
  magnifier:   '<circle cx="10.6" cy="10.6" r="6.4"/><path d="M15.4 15.4l5 5"/>',
  clipboard:   '<rect x="4.6" y="3.6" width="14.8" height="17.6" rx="2"/><path d="M9 3.6V2.4h6v1.2"/><circle cx="11" cy="11.4" r="3.4"/><path d="M13.6 14l2.8 2.8"/>',
  // 人 / 服務
  people:      '<circle cx="9.2" cy="8.4" r="3.1"/><path d="M3.4 19.4c0-3.4 2.6-5.6 5.8-5.6s5.8 2.2 5.8 5.6"/><circle cx="17.2" cy="9.8" r="2.3"/><path d="M16 14.1c2.6-.3 4.6 1.7 4.6 4.6"/>',
  headset:     '<path d="M4.6 14.6v-2.4a7.4 7.4 0 0114.8 0v2.4"/><rect x="2.9" y="13.4" width="4.2" height="6.4" rx="2.1"/><rect x="16.9" y="13.4" width="4.2" height="6.4" rx="2.1"/><path d="M19 19.8v.6c0 1.2-1 2.2-2.2 2.2h-2.3"/>',
  gearpeople:  '<circle cx="8.6" cy="10.4" r="3.4"/><path d="M8.6 4.4v2M8.6 14.4v2M2.6 10.4h2M12.6 10.4h2M4.4 6.2l1.4 1.4M11.4 13.2l1.4 1.4M12.8 6.2l-1.4 1.4M5.8 13.2l-1.4 1.4"/><circle cx="17.4" cy="10.2" r="2.6"/><path d="M12.8 20.4c0-2.9 2.1-4.8 4.6-4.8s4.6 1.9 4.6 4.8"/>',
  deskwork:    '<rect x="7.4" y="5.6" width="13" height="9" rx="1.4"/><path d="M10.4 18.4h10M15.4 14.6v3.8"/><circle cx="4.6" cy="9" r="2.4"/><path d="M1.4 18.4c0-2.4 1.4-4 3.2-4s3.2 1.6 3.2 4"/>',
  handshake:   '<path d="M2.6 11.4l3.4-3.4 4 1.6 3.4-1.6 4 1.6 4 3.8-3 3-2.6-2.2"/><path d="M9.4 13.4l2.6 2.4 2.4-2M6 8l-3.4 5.4 3 3"/>',
  // 分析 / 成果
  chart:       '<path d="M3.6 20.2h16.8"/><path d="M6.4 20.2v-6.1M11 20.2V9.3M15.6 20.2v-4M20.2 20.2V5.4"/>',
  trendup:     '<path d="M3.4 17.4l5.4-5.6 3.6 3.4 7.8-8"/><path d="M15.4 7.2h5v5"/><path d="M3.4 20.6h17.2"/>',
  tag:         '<path d="M11.4 3.1H4.2a1 1 0 00-1 1v7.2a1 1 0 00.3.7l8.6 8.6a1 1 0 001.4 0l7.2-7.2a1 1 0 000-1.4L12.1 3.4a1 1 0 00-.7-.3z"/><circle cx="7.9" cy="7.8" r="1.7"/>',
  coins:       '<ellipse cx="12" cy="6.4" rx="7" ry="3"/><path d="M5 6.4v4.4c0 1.7 3.1 3 7 3s7-1.3 7-3V6.4"/><path d="M5 11.2v4.4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4.4"/>',
  target:      '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2"/>',
  gauge:       '<path d="M3.6 17.4a8.4 8.4 0 1116.8 0"/><path d="M12 17.4l4.4-5.4"/><circle cx="12" cy="17.4" r="1.6"/>',
  clock:       '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.6V12l3.8 2.4"/>',
  brokenchain: '<path d="M9.4 8.2L6.6 5.4a3.6 3.6 0 10-5.1 5.1l2.8 2.8"/><path d="M14.6 15.8l2.8 2.8a3.6 3.6 0 105.1-5.1l-2.8-2.8"/><path d="M12.4 4.2l1.2 2.6M18.6 7.4l-2.4 1.6M8.4 19.6l1.4-2.6M4.2 15.4l2.6 1.2"/>',
  // AI / 知識
  brain:       '<path d="M12 4.2c-1.9-1.4-5.1-.7-5.7 1.8-1.9.4-2.8 2.3-2.1 3.9-1.4 1.3-1.2 3.6.5 4.5-.3 2 1.4 3.6 3.3 3.3.7 1.7 3.1 2.2 4 .5z"/><path d="M12 4.2c1.9-1.4 5.1-.7 5.7 1.8 1.9.4 2.8 2.3 2.1 3.9 1.4 1.3 1.2 3.6-.5 4.5.3 2-1.4 3.6-3.3 3.3-.7 1.7-3.1 2.2-4 .5z"/><path d="M12 4.2v14M8.6 8.6h2.2M13.2 11.4h2.4M9.2 13.6h1.8"/>',
  chip:        '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2"/><rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1"/><path d="M9.4 6.4V3.4M14.6 6.4V3.4M9.4 20.6v-3M14.6 20.6v-3M6.4 9.4H3.4M6.4 14.6H3.4M20.6 9.4h-3M20.6 14.6h-3"/>',
  puzzle:      '<path d="M4 4.6h5.4a1.8 1.8 0 113.6 0H20v5.6a1.8 1.8 0 100 3.6V20h-6.8a1.8 1.8 0 10-3.6 0H4z"/>',
  book:        '<path d="M12 5.6C9.6 4 6.6 3.8 3.7 4.9v13.4c2.9-1.1 5.9-.9 8.3.7"/><path d="M12 5.6c2.4-1.6 5.4-1.8 8.3-.7v13.4c-2.9-1.1-5.9-.9-8.3.7z"/><path d="M12 5.6V20"/>',
  bulb:        '<path d="M12 3.2a6.2 6.2 0 00-3.6 11.2v2.2h7.2v-2.2A6.2 6.2 0 0012 3.2z"/><path d="M9.6 19.2h4.8M10.4 21.4h3.2"/>',
  // fallback
  _default:    '<rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3"/><path d="M8.6 12h6.8M12 8.6v6.8"/>',
};

const has = name => Object.prototype.hasOwnProperty.call(PATHS, name);

/** 線寬相對圖示尺寸的比例:24px 圖示 ≈ 1.6px 線,80px ≈ 5.2px。跨尺寸視覺重量才一致。 */
const STROKE_RATIO = 0.065;

/**
 * 產生一組線稿圖示的 SVG 片段。
 * @param name    圖示名;查不到時回傳中性幾何形並經 warn 記錄(不靜默留白)
 * @param size    螢幕上的圖示邊長
 * @param opts.sw 螢幕上的線寬;省略則依 size × 0.065 自動決定
 */
function icon(name, x, y, size, color, { sw = null, warn = null } = {}) {
  let d = PATHS[name];
  if (!d) {
    d = PATHS._default;
    if (warn) warn('icon', `找不到圖示「${name}」,已用預設幾何形替代`, 'icons.js');
  }
  const k = size / 24;
  const onScreen = sw ?? size * STROKE_RATIO;
  return `<g transform="translate(${x},${y}) scale(${k.toFixed(4)})" fill="none" stroke="${color}" ` +
         `stroke-width="${(onScreen / k).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
}

module.exports = { icon, has, names: Object.keys(PATHS).filter(n => n[0] !== '_') };
