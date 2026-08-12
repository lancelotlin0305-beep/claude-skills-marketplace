#!/usr/bin/env node
// [入口] 逐頁製作規格 .md → 正規化內容 JSON。
//   node parse_spec.js <spec.md> --list                 # 列出所有頁與建議模板
//   node parse_spec.js <spec.md> --page=P9              # 印出單頁正規化結果
//   node parse_spec.js <spec.md> --out=./content        # 全部輸出成 <page>.raw.json
//
// 能做到的(確定性):抽出主標題、次標題、頁型、頁碼、「頁面完整可見資訊」的巢狀清單,
//   以及重點標示/數字依據/禁止事項/逐字稿等旁註。
// 做不到的(需要判斷):把某一組資料對應到模板的哪個欄位(sources? modules? columns?)。
//   因此本檔輸出「正規化中間格式 + 建議模板」,最後一哩由人或對應設定完成——
//   假裝全自動只會產出對不上內容的圖。
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const specFile = args.find(a => !a.startsWith('--'));
if (!specFile) {
  console.error('用法: node parse_spec.js <spec.md> [--list] [--page=P9] [--out=目錄]');
  process.exit(1);
}
const md = fs.readFileSync(specFile, 'utf8');

// ---------------------------------------------------------------- 切頁
/** 以 "## P<n>｜<標題>" 為界切成頁 */
function splitPages(text) {
  const lines = text.split(/\r?\n/);
  const pages = [];
  let cur = null;
  for (const ln of lines) {
    const m = ln.match(/^##\s+(P\d+)\s*[｜|]\s*(.+?)\s*$/);
    if (m) {
      if (cur) pages.push(cur);
      cur = { id: m[1], heading: m[2].replace(/【[^】]*】/g, '').trim(), tags: (m[2].match(/【[^】]*】/g) || []).map(t => t.slice(1, -1)), body: [] };
    } else if (cur) cur.body.push(ln);
  }
  if (cur) pages.push(cur);
  return pages;
}

// ---------------------------------------------------------------- 解析單頁欄位
const FIELD = /^-\s*\*\*(.+?)\*\*\s*(?:（[^）]*）)?\s*[：:]\s*(.*)$/;

function parsePage(p) {
  const out = {
    page: p.id.replace(/^P/, ''), heading: p.heading, tags: p.tags,
    fields: {}, groups: [], notes: {},
  };
  let curField = null, curGroup = null;

  for (const raw of p.body) {
    const ln = raw.replace(/\s+$/, '');
    if (!ln.trim()) continue;

    const f = ln.match(FIELD);
    if (f) {
      curField = f[1].trim();
      const val = f[2].trim();
      out.fields[curField] = val;
      curGroup = null;
      if (curField === '頁面完整可見資訊' && val && !/^$/.test(val)) {
        // 值直接寫在同一行(如「五項量化目標」)——當作群組標題
        out.groups.push(curGroup = { label: val, items: [] });
      }
      continue;
    }
    // 巢狀清單:兩個空白起始的 "- "
    const l2 = ln.match(/^\s{2,3}-\s+(.*)$/);
    if (l2 && curField === '頁面完整可見資訊') {
      const t = l2[1].trim();
      const kv = t.match(/^(.+?)\s*[：:]\s*(.+)$/);
      if (kv) out.groups.push(curGroup = { label: kv[1].trim(), items: splitItems(kv[2]) });
      else out.groups.push(curGroup = { label: t, items: [] });
      continue;
    }
    const l3 = ln.match(/^\s{4,}-\s+(.*)$/);
    if (l3 && curGroup) { curGroup.items.push(l3[1].trim()); continue; }

    // 其他欄位的續行
    if (curField && !/^-/.test(ln)) {
      out.notes[curField] = ((out.notes[curField] || '') + ' ' + ln.trim()).trim();
    }
  }
  return out;
}

/** 把「A、B、C」或「A｜B｜C」拆成陣列;單句則保持整句 */
function splitItems(s) {
  const t = s.trim();
  if (/[、｜]/.test(t) && t.length < 80) return t.split(/[、｜]/).map(x => x.trim()).filter(Boolean);
  return [t];
}

// ---------------------------------------------------------------- 建議模板
function suggest(pg) {
  const g = pg.groups, n = g.length;
  const allShort = g.every(x => x.items.length <= 6);
  const hasHub = g.some(x => /DataHub|資料層|中樞|hub/i.test(x.label));
  const hasSrc = g.some(x => /來源|既有系統|ERP|串接/.test(x.label + x.items.join()));
  const hasNum = g.some(x => x.items.some(i => /\d+(\.\d+)?\s*[%家件天]/.test(i)));
  if (hasHub && hasSrc) return { template: 'hub-flow', why: '同時出現「資料來源」與「DataHub/中樞」群組' };
  if (n >= 2 && n <= 5 && allShort) return { template: 'columns', why: `${n} 個並列群組、每組項目 ≤6` };
  if (hasNum && n <= 5) return { template: 'kpi(待建)', why: '群組內含帶單位的數字' };
  if (n > 5) return { template: '拆頁或表格(待建)', why: `${n} 個群組,單頁可能超載(§10)` };
  return { template: '(需人工判定)', why: '群組型態不明確' };
}

// ---------------------------------------------------------------- 輸出
const pages = splitPages(md).map(parsePage);

if (args.includes('--list')) {
  console.log(`共 ${pages.length} 頁  (來源:${path.basename(specFile)})\n`);
  console.log('頁碼  主標題'.padEnd(38) + '群組  建議模板        判定依據');
  console.log('-'.repeat(112));
  for (const p of pages) {
    const title = p.fields['主標題'] || p.heading;
    const s = suggest(p);
    console.log(
      p.page.padEnd(5) + (title.length > 15 ? title.slice(0, 15) + '…' : title).padEnd(20) +
      String(p.groups.length).padStart(3) + '   ' + s.template.padEnd(16) + s.why
    );
  }
  process.exit(0);
}

const wanted = opt('page');
const outDir = opt('out');
const sel = wanted ? pages.filter(p => 'P' + p.page === wanted || p.page === wanted.replace(/^P/, '')) : pages;
if (wanted && !sel.length) { console.error(`找不到 ${wanted}`); process.exit(1); }

for (const p of sel) {
  const s = suggest(p);
  const doc = {
    _suggestedTemplate: s.template,
    _why: s.why,
    _todo: '把 groups 對應到模板欄位後,移除底線開頭的欄位並改名為 <page>.json',
    template: null,
    mode: '16x9',
    palette: 'geox-navy',
    title: p.fields['主標題'] || p.heading,
    subtitle: p.fields['次標題'] || undefined,
    page: p.page,
    footnote: '*本簡報內容著作權為巨鷗跨界智慧集團所有，未經許可不得任意轉載、重製、複印使用',
    groups: p.groups,
    _spec: {
      頁型: p.fields['頁型'], 來源: p.fields['來源'], 圖片設計: p.fields['圖片設計'],
      重點標示: p.fields['重點標示'], 數字依據: p.fields['數字依據'], 禁止事項: p.fields['禁止事項'],
      標記: p.tags,
    },
  };
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const f = path.join(outDir, `p${p.page}.raw.json`);
    fs.writeFileSync(f, JSON.stringify(doc, null, 2));
    console.log('寫出', f, `(建議 ${s.template})`);
  } else {
    console.log(JSON.stringify(doc, null, 2));
  }
}
