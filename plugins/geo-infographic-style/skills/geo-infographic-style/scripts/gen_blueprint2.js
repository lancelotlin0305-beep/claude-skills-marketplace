// [範例生成器] 流程/roadmap 階梯成長版(16:9):卡片逐階上升 + 成長曲線 + 透明去背場景浮貼 + 淺色基礎橫帶。
// gen_blueprint.js 的階梯佈局變體。替換 cards/chips 資料即可他用。
// 圖二:階梯成長版(16:9)——卡片逐階上升 + 成長曲線串接 + 全寬淺色基礎橫帶。重用同一批場景/文字。
const fs=require('fs'),path=require('path');
const {mode}=require('./page_modes');
const OUT=process.argv[2];
const ASSETS=process.argv[3]||'./assets-scenes';
// 本檔為 16:9 簡報頁模式;字級一律取自 page_modes(style-spec §6.1),不得寫死。
const MD=mode('16x9'),T=MD.type;
const W=MD.W,H=MD.H;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const tw=(s,size)=>[...String(s)].reduce((a,ch)=>a+(/[\x00-\xff]/.test(ch)?0.55:1)*size,0);
let o=[];const P=(...s)=>o.push(...s);
const TITLE='#122B6E',INK='#2A3555',MUT='#66708C',ACC='#3E7BFA';

const DEFS=`
<linearGradient id="gBandB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8FBFF"/><stop offset="1" stop-color="#E3ECFB"/></linearGradient>
<linearGradient id="gBandT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6FBF8"/><stop offset="1" stop-color="#E0F0E7"/></linearGradient>
<linearGradient id="gBandG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6FCF8"/><stop offset="1" stop-color="#DFF1E8"/></linearGradient>
<linearGradient id="gBandP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF7FF"/><stop offset="1" stop-color="#E9E0FA"/></linearGradient>
<linearGradient id="gBandLite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7FAFD"/><stop offset="1" stop-color="#E9F0F8"/></linearGradient>
<linearGradient id="gHdrB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#628CF2"/><stop offset=".5" stop-color="#3A5CD4"/><stop offset="1" stop-color="#1E379E"/></linearGradient>
<linearGradient id="gHdrT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#48B87E"/><stop offset=".5" stop-color="#2E9E5B"/><stop offset="1" stop-color="#166B3D"/></linearGradient>
<linearGradient id="gHdrG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43C481"/><stop offset=".5" stop-color="#1F9254"/><stop offset="1" stop-color="#115C34"/></linearGradient>
<linearGradient id="gHdrP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C71E8"/><stop offset=".5" stop-color="#6D3FC0"/><stop offset="1" stop-color="#452092"/></linearGradient>
<radialGradient id="sBlue" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#6B8CF0"/><stop offset="1" stop-color="#1F3CA6"/></radialGradient>
<radialGradient id="sTeal" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#5FC98F"/><stop offset="1" stop-color="#166B3D"/></radialGradient>
<radialGradient id="sGreen" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#4CC981"/><stop offset="1" stop-color="#0F6B3A"/></radialGradient>
<radialGradient id="sPurple" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#A47BF0"/><stop offset="1" stop-color="#4E27A0"/></radialGradient>
<filter id="shadow" x="-25%" y="-25%" width="150%" height="165%"><feDropShadow dx="0" dy="9" stdDeviation="12" flood-color="#1B2A6B" flood-opacity="0.14"/><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#1B2A6B" flood-opacity="0.10"/></filter>
<filter id="row" x="-20%" y="-40%" width="140%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1B2A6B" flood-opacity="0.10"/></filter>
`;

P(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Noto Sans TC, Microsoft JhengHei, sans-serif">`);
P(`<defs>${DEFS}</defs>`);
P(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
P(`<circle cx="1560" cy="200" r="190" fill="#EAF1FA" opacity="0.5"/><circle cx="240" cy="560" r="130" fill="#EAF6EF" opacity="0.4"/>`);

P(`<text x="${W/2}" y="82" font-size="${T.title}" font-weight="900" fill="${TITLE}" text-anchor="middle">計畫未來發展藍圖</text>`);
P(`<text x="${W/2}" y="122" font-size="${T.sub}" font-weight="400" fill="${MUT}" text-anchor="middle">以現有平台為基礎・整體規劃・分期實施(各項屬規劃建議)</text>`);

// ===== 示範資料(中性範例;他案整段替換此區)=====
const cards=[
 {c:'B',pill:'第一階段',title:'核心平台建置',asset:'scene_P1.png',
  body:['帳號權限・申請受理・案件管理','無紙化核心流程','與外部系統介接對應']},
 {c:'T',pill:'第二階段',title:'數據分析與決策儀表板',asset:'scene_P2.png',
  body:['效率・時效・進度視覺化','輔以 AI 異常預警','作為決策與流程優化依據']},
 {c:'G',pill:'第三階段',title:'綜合查詢與圖台服務',asset:'scene_P3.png',
  body:['定位・底圖・量測計算','多圖層套疊查詢','對外自助查詢服務']},
 {c:'P',pill:'第四階段',title:'AI 深化與數據治理',asset:'scene_P4.png',
  body:['AI 判釋・文件輔助草擬','跨機關資料治理','打造智慧化數位治理']},
];
const COL={B:{band:'gBandB',hdr:'gHdrB',sph:'sBlue',deep:'#2444B8',edge:'#DDE5F7',main:'#2F54D1'},
 T:{band:'gBandT',hdr:'gHdrT',sph:'sTeal',deep:'#1E7A46',edge:'#DFEAE3',main:'#2E9E5B'},
 G:{band:'gBandG',hdr:'gHdrG',sph:'sGreen',deep:'#177A44',edge:'#D8EEDF',main:'#1F9254'},
 P:{band:'gBandP',hdr:'gHdrP',sph:'sPurple',deep:'#5B2FAE',edge:'#E6DCF7',main:'#6D3FC0'}};

const x0=70,cw=428,gap=15,ch=460,pad=22;
const cyTop0=350,step=44;             // 逐階上升
const cyOf=i=>cyTop0-i*step;

// ---- 成長曲線(先畫,墊在卡下;節點之後畫在卡上) ----
const nodes=cards.map((_,i)=>({x:x0+i*(cw+gap)+26, y:cyOf(i)}));
const linePts=nodes.map(n=>`${n.x} ${n.y}`).join(' L ');
const tipX=nodes[3].x+cw-30, tipY=nodes[3].y-46;
P(`<path d="M ${linePts} L ${tipX} ${tipY}" fill="none" stroke="${ACC}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.14"/>`);
P(`<path d="M ${linePts} L ${tipX} ${tipY}" fill="none" stroke="${ACC}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 12"/>`);
// 箭頭
const ang=Math.atan2(tipY-nodes[3].y, tipX-nodes[3].x);
const a1x=tipX-22*Math.cos(ang-0.5), a1y=tipY-22*Math.sin(ang-0.5), a2x=tipX-22*Math.cos(ang+0.5), a2y=tipY-22*Math.sin(ang+0.5);
P(`<path d="M${tipX} ${tipY} L${a1x.toFixed(1)} ${a1y.toFixed(1)} L${a2x.toFixed(1)} ${a2y.toFixed(1)} z" fill="${ACC}"/>`);
P(`<text x="${tipX-6}" y="${tipY-18}" font-size="${T.pill}" font-weight="800" fill="${ACC}" text-anchor="end">願景</text>`);

// ---- 卡片(逐階) ----
cards.forEach((cd,i)=>{
  const x=x0+i*(cw+gap),cy=cyOf(i),R=COL[cd.c];
  P(`<rect x="${x}" y="${cy+6}" width="${cw}" height="${ch}" rx="18" fill="${R.main}" opacity="0.15"/>`);
  P(`<rect x="${x}" y="${cy}" width="${cw}" height="${ch}" rx="18" fill="url(#${R.band})" stroke="${R.main}" stroke-width="2" filter="url(#shadow)"/>`);
  const pw=tw(cd.pill,T.pill)+30, ph=38;
  P(`<rect x="${x+pad}" y="${cy+16}" width="${pw}" height="${ph}" rx="${ph/2}" fill="url(#${R.hdr})" filter="url(#row)"/>`);
  P(`<text x="${x+pad+pw/2}" y="${cy+16+ph/2+7}" font-size="${T.pill}" font-weight="700" fill="#fff" text-anchor="middle">${esc(cd.pill)}</text>`);
  P(`<text x="${x+pad}" y="${cy+96}" font-size="${T.cardTitle}" font-weight="800" fill="${R.deep}">${esc(cd.title)}</text>`);
  P(`<line x1="${x+pad}" y1="${cy+110}" x2="${x+cw-pad}" y2="${cy+110}" stroke="${R.edge}" stroke-width="1.5"/>`);
  const blh=34;
  cd.body.forEach((ln,j)=>{P(`<text x="${x+pad}" y="${cy+146+j*blh}" font-size="${T.body}" font-weight="500" fill="${INK}">${esc(ln)}</text>`);});
  const sTop=cy+124+cd.body.length*blh+8, sBot=cy+ch-8;
  try{const b64=fs.readFileSync(path.join(ASSETS,cd.asset)).toString('base64');
    P(`<image x="${x+14}" y="${sTop}" width="${cw-28}" height="${sBot-sTop}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${b64}"/>`);
  }catch(e){console.error('缺場景',cd.asset);}
  // 成長節點(畫在卡上緣)
  P(`<circle cx="${x+26}" cy="${cy}" r="9" fill="#fff" stroke="${ACC}" stroke-width="3"/><circle cx="${x+26}" cy="${cy}" r="3.5" fill="${ACC}"/>`);
});

// ---- 基礎橫帶(全寬淺色) ----
const by=832,bh=206,bx=70,bw=W-140;
P(`<rect x="${bx}" y="${by+6}" width="${bw}" height="${bh}" rx="20" fill="#5A6E8C" opacity="0.12"/>`);
P(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="20" fill="url(#gBandLite)" stroke="#B9C6D8" stroke-width="2" filter="url(#shadow)"/>`);
const bandLabel='核心平台基礎(第一階段)', blw=tw(bandLabel,T.subCard)+44;
P(`<rect x="${bx+24}" y="${by+20}" width="${blw}" height="42" rx="21" fill="url(#gHdrB)" filter="url(#row)"/>`);
P(`<text x="${bx+24+blw/2}" y="${by+48}" font-size="${T.subCard}" font-weight="800" fill="#fff" text-anchor="middle">${bandLabel}</text>`);
P(`<text x="${bx+24+blw+28}" y="${by+48}" font-size="${T.note}" font-weight="400" fill="${MUT}">實線＝現有範圍;上方階段卡屬後續規劃</text>`);
const chips=[['案件申請平台','(申辦・追蹤)'],['通報／查詢平台','(行動化)'],['三階權限 RBAC','＋覆核'],['數位足跡','(全程留痕)'],['單一登入 OIDC','＋多因子'],['外部 API','格式對應'],['AI 智慧助理','(選配)'],['資安 DMZ','前後台分離']];
const chipMain=['#2F54D1','#1F9254','#E8850C','#6D3FC0','#C62839','#2E9E5B','#5A6E8C','#B08A2E'];
const cxs=8,cgap=12,ciw=(bw-48-(cxs-1)*cgap)/cxs,cyy=by+78,cih=116;
chips.forEach((lines,i)=>{
  const cx=bx+24+i*(ciw+cgap);
  P(`<rect x="${cx}" y="${cyy}" width="${ciw}" height="${cih}" rx="12" fill="#fff" stroke="#DDE3EC" stroke-width="1.4" filter="url(#row)"/>`);
  P(`<circle cx="${cx+ciw/2}" cy="${cyy+30}" r="17" fill="${chipMain[i]}" opacity="0.16"/><circle cx="${cx+ciw/2}" cy="${cyy+30}" r="8" fill="${chipMain[i]}"/>`);
  const y0 = lines.length>1 ? cyy+66 : cyy+74;
  lines.forEach((ln,j)=>P(`<text x="${cx+ciw/2}" y="${y0+j*26}" font-size="${T.pill}" font-weight="600" fill="${INK}" text-anchor="middle">${esc(ln)}</text>`));
});

P(`</svg>`);
fs.writeFileSync(OUT,o.join('\n'));
console.log('blueprint2 ->',OUT);
