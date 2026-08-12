#!/usr/bin/env node
// [入口] 內容 JSON + 模板 → SVG。座標由 engine 求解、validator 驗收。
//   node build.js <content.json> <out.svg> [--template=id] [--mode=16x9] [--palette=geox-navy] [--no-strict]
// content.json 未指定 template 時,依各模板的 accepts() 自動判定版型。
const fs = require('fs'), path = require('path');
const { Doc } = require('./engine');

const TPL_DIR = path.join(__dirname, '..', 'templates');
const templates = fs.readdirSync(TPL_DIR).filter(f => f.endsWith('.js')).map(f => require(path.join(TPL_DIR, f)));

const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || null;
const [contentFile, outFile] = args.filter(a => !a.startsWith('--'));
if (!contentFile || !outFile) {
  console.error('用法: node build.js <content.json> <out.svg> [--template=id] [--mode=16x9] [--palette=geox-navy] [--no-strict]');
  console.error('可用模板:', templates.map(t => t.id).join(', '));
  process.exit(1);
}

const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
const wanted = opt('template') || content.template;
const tpl = wanted ? templates.find(t => t.id === wanted) : templates.find(t => t.accepts(content));
if (!tpl) {
  console.error(wanted ? `找不到模板「${wanted}」` : '沒有任何模板接受這份內容,請以 --template= 指定');
  console.error('可用模板:', templates.map(t => t.id).join(', '));
  process.exit(1);
}

const doc = new Doc({
  mode: opt('mode') || content.mode || '16x9',
  palette: opt('palette') || content.palette || 'geox-navy',
});
console.log(`模板 ${tpl.id} / 模式 ${doc.mode.label} ${doc.W}x${doc.H} / 色盤 ${doc.P.name}`);
tpl.render(doc, content);
doc.validate({ strict: !args.includes('--no-strict') });
doc.write(outFile);
