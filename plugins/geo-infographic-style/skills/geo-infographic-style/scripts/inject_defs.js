#!/usr/bin/env node
/*
 R6 defs 注入:把 assets/defs.svg 內的漸層/濾鏡/symbol 自動注入目標 SVG,
 免去人肉複製整段 defs(避免漏貼或貼到舊版)。冪等:重跑不會重複注入。
 用法:
   node inject_defs.js 圖.svg            # 就地注入
   node inject_defs.js 圖.svg 輸出.svg   # 另存
 規則:
   - 目標 SVG 已有 <defs>…</defs> → 把 base defs 內容插入其開頭(僅補「id 尚不存在」者)。
   - 目標 SVG 無 <defs> → 在根 <svg …> 開標籤後插入一段完整 <defs>。
*/
const fs = require('fs'), path = require('path');

const target = process.argv[2];
if (!target) { console.error('用法: node inject_defs.js 圖.svg [輸出.svg]'); process.exit(1); }
const out = process.argv[3] || target;

const baseFile = path.join(__dirname, '..', 'assets', 'defs.svg');
let base, svg;
try { base = fs.readFileSync(baseFile, 'utf8'); } catch (e) { console.error('找不到 assets/defs.svg:', e.message); process.exit(1); }
try { svg = fs.readFileSync(path.resolve(target), 'utf8'); } catch (e) { console.error('讀取目標失敗:', e.message); process.exit(1); }

// 取 base defs 內部節點。
// 先剝掉 XML 註解再比對——註解裡若出現字面標籤(defs.svg 的檔頭說明就寫過),
// 非貪婪比對會從註解內那個標籤起算,把註解殘段與 <svg> 開標籤一起吃進來,產出無法解析的 SVG。
const baseStripped = base.replace(/<!--[\s\S]*?-->/g, '');
const baseInner = (baseStripped.match(/<defs>([\s\S]*?)<\/defs>/i) || [, ''])[1].trim();
if (!baseInner) { console.error('assets/defs.svg 內沒有 <defs> 內容'); process.exit(1); }
// 防呆:抽出的內容不該再含有 <svg> 開標籤
if (/<svg\b/i.test(baseInner)) { console.error('defs 抽取異常:內容含 <svg> 開標籤,請檢查 assets/defs.svg 結構'); process.exit(1); }

// 已存在的 id 不重複注入(冪等 + 不覆蓋圖檔自訂同名 def)
const existingIds = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const kept = baseInner
  .split(/(?=<(?:linearGradient|radialGradient|filter|symbol|pattern|clipPath|mask)\b)/)
  .filter(block => {
    const id = (block.match(/\bid="([^"]+)"/) || [])[1];
    return id ? !existingIds.has(id) : block.trim().length > 0;
  })
  .join('');

if (!kept.trim()) { console.log('無需注入:所有 base def id 已存在。'); fs.writeFileSync(path.resolve(out), svg); process.exit(0); }

let result;
if (/<defs>/i.test(svg)) {
  result = svg.replace(/<defs>/i, '<defs>\n<!-- injected from assets/defs.svg -->\n' + kept + '\n');
} else {
  result = svg.replace(/(<svg\b[^>]*>)/i, '$1\n<defs>\n<!-- injected from assets/defs.svg -->\n' + kept + '\n</defs>');
}
fs.writeFileSync(path.resolve(out), result);
console.log('已注入 base defs →', out);
