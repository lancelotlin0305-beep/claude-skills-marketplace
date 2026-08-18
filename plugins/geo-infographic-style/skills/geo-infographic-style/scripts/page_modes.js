// [相容層] 舊生成器的 page_modes 介面,實際值一律轉由 tokens.js / tokens.json 提供。
// 新程式請直接 require('./tokens');本檔僅為既有 gen_*.js 保留,待全部遷移後移除。
const tk = require('./tokens');

const MODES = Object.fromEntries(
  Object.keys(tk.RAW.modes).map(name => {
    const m = tk.RAW.modes[name];
    return [name, {
      W: m.canvas.w, H: m.canvas.h, anchor: m.anchor, k: m.k,
      pct: m.pct, pt: m.pt, type: m.type,
    }];
  })
);

function mode(name) {
  const m = MODES[name];
  if (!m) throw new Error(`未知頁面模式「${name}」,可用:${Object.keys(MODES).join(' / ')}`);
  return m;
}

const scale = (m, v) => Math.round(v * (m.k ?? 1));

module.exports = { MODES, mode, scale };
