// [範例生成器] 依「圖文結構語法」規則生成角色/中心輻射圖(3 級同構、圖文並置、hub-spoke)。
// 內含中性示範資料,他案替換 leftCards/rightCards/hub 資料即可。屬 style-spec §13/§14 的參考實作。
// 統一圖文結構生成器：五級共用骨架(圖文35:65 鏡像 + hub-spoke)，主圖區豐富度依 LEVEL 遞增。
// 用法: node gen_role.js <level 1-5> <out.svg> [assetsDir]
const fs=require('fs'),path=require('path');
const LEVEL=parseInt(process.argv[2]||'2',10);
const OUT=process.argv[3];
const ASSETS=process.argv[4]||'./geo-assets';
const W=1760,H=1060;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let o=[];const P=(...s)=>o.push(...s);

// ---------- palette per role ----------
const ROLE={
 blue :{band:'gBandB',hdr:'gHdrB',sph:'sBlue',  main:'#2F54D1',edge:'#DDE5F7',deep:'#2444B8'},
 green:{band:'gBandG',hdr:'gHdrG',sph:'sGreen', main:'#1F9254',edge:'#D8EEDF',deep:'#177A44'},
 orange:{band:'gBandO',hdr:'gHdrO',sph:'sOrange',main:'#E8850C',edge:'#F6E3C6',deep:'#C86F04'},
 purple:{band:'gBandP',hdr:'gHdrP',sph:'sPurple',main:'#6D3FC0',edge:'#E6DCF7',deep:'#5B2FAE'},
 red  :{band:'gBandR',hdr:'gHdrR',sph:'sRed',   main:'#C62839',edge:'#F3D5D9',deep:'#B01F30'},
 gray :{band:'gBandN',hdr:'gHdrGray',sph:'sNavy',main:'#9AA3B2',edge:'#DDE3EC',deep:'#7F9186'},
};
const INK='#2A3555',MUT='#66708C',FAINT='#9AA3B2',TITLE='#122B6E';

// ---------- defs (subset copied from skill assets/defs.svg + hub) ----------
const DEFS=`
<linearGradient id="gBandB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8FBFF"/><stop offset="1" stop-color="#E3ECFB"/></linearGradient>
<linearGradient id="gBandG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6FCF8"/><stop offset="1" stop-color="#DFF1E8"/></linearGradient>
<linearGradient id="gBandO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBF3"/><stop offset="1" stop-color="#F8E9D0"/></linearGradient>
<linearGradient id="gBandP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF7FF"/><stop offset="1" stop-color="#E9E0FA"/></linearGradient>
<linearGradient id="gBandR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9FA"/><stop offset="1" stop-color="#FBE9EC"/></linearGradient>
<linearGradient id="gBandN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6F8FB"/><stop offset="1" stop-color="#E3E9F1"/></linearGradient>
<linearGradient id="gHdrB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#628CF2"/><stop offset=".5" stop-color="#3A5CD4"/><stop offset="1" stop-color="#1E379E"/></linearGradient>
<linearGradient id="gHdrG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43C481"/><stop offset=".5" stop-color="#1F9254"/><stop offset="1" stop-color="#115C34"/></linearGradient>
<linearGradient id="gHdrO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB552"/><stop offset=".5" stop-color="#E8890F"/><stop offset="1" stop-color="#B85F00"/></linearGradient>
<linearGradient id="gHdrP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C71E8"/><stop offset=".5" stop-color="#6D3FC0"/><stop offset="1" stop-color="#452092"/></linearGradient>
<linearGradient id="gHdrR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E86075"/><stop offset=".5" stop-color="#B02036"/><stop offset="1" stop-color="#7E1222"/></linearGradient>
<linearGradient id="gHdrGray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A2B3A8"/><stop offset=".5" stop-color="#7F9186"/><stop offset="1" stop-color="#5F7268"/></linearGradient>
<radialGradient id="sBlue" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#6B8CF0"/><stop offset="1" stop-color="#1F3CA6"/></radialGradient>
<radialGradient id="sGreen" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#4CC981"/><stop offset="1" stop-color="#0F6B3A"/></radialGradient>
<radialGradient id="sOrange" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFC161"/><stop offset="1" stop-color="#C86F04"/></radialGradient>
<radialGradient id="sPurple" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#A47BF0"/><stop offset="1" stop-color="#4E27A0"/></radialGradient>
<radialGradient id="sRed" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#EE6F84"/><stop offset="1" stop-color="#961A2B"/></radialGradient>
<radialGradient id="sNavy" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#8298B8"/><stop offset="1" stop-color="#3E4F6E"/></radialGradient>
<linearGradient id="gIlloB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF1FF"/><stop offset="1" stop-color="#CDDCF7"/></linearGradient>
<linearGradient id="gIlloG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E7F6ED"/><stop offset="1" stop-color="#C9E7D5"/></linearGradient>
<linearGradient id="gIlloO" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3E2"/><stop offset="1" stop-color="#F6DDBB"/></linearGradient>
<linearGradient id="gIlloP" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2EAFF"/><stop offset="1" stop-color="#DECBF5"/></linearGradient>
<linearGradient id="gIlloR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFECEF"/><stop offset="1" stop-color="#F5CDD4"/></linearGradient>
<linearGradient id="gIlloN" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EEF1F6"/><stop offset="1" stop-color="#D6DDE7"/></linearGradient>
<linearGradient id="gCore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4FAFB"/><stop offset="1" stop-color="#DCEBEE"/></linearGradient>
<linearGradient id="gCoreBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E7C8A"/><stop offset="0.5" stop-color="#1C4E5A"/><stop offset="1" stop-color="#123A44"/></linearGradient>
<radialGradient id="sCore" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#4F9AA8"/><stop offset="1" stop-color="#123A44"/></radialGradient>
<filter id="shadow" x="-25%" y="-25%" width="150%" height="165%"><feDropShadow dx="0" dy="9" stdDeviation="12" flood-color="#1B2A6B" flood-opacity="0.14"/><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#1B2A6B" flood-opacity="0.10"/></filter>
<filter id="row" x="-20%" y="-40%" width="140%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1B2A6B" flood-opacity="0.10"/></filter>
<filter id="hdr" x="-20%" y="-40%" width="140%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#14213D" flood-opacity="0.26"/></filter>
<filter id="obj" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#14213D" flood-opacity="0.28"/></filter>
<symbol id="chk" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="M5.5 10.6l3 3 6-6.6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="clk" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="#fff" stroke="currentColor" stroke-width="2"/><path d="M10 5.8V10l3.2 2.2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<linearGradient id="lpScreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#25406e"/><stop offset="1" stop-color="#15243f"/></linearGradient>
<linearGradient id="lpBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8edf4"/><stop offset="1" stop-color="#aab6c7"/></linearGradient>
<linearGradient id="lpBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd8e4"/><stop offset="0.5" stop-color="#e6ebf2"/><stop offset="1" stop-color="#9aa7ba"/></linearGradient>
<radialGradient id="ggA" cx="0.38" cy="0.3" r="0.9"><stop offset="0" stop-color="#a7bce3"/><stop offset="0.5" stop-color="#6480b4"/><stop offset="1" stop-color="#28406b"/></radialGradient>
<linearGradient id="ggRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdd9f0"/><stop offset="1" stop-color="#26406b"/></linearGradient>
<radialGradient id="ggB" cx="0.4" cy="0.32" r="0.9"><stop offset="0" stop-color="#e6b6a0"/><stop offset="0.5" stop-color="#c07a58"/><stop offset="1" stop-color="#7c4026"/></radialGradient>
<linearGradient id="ggRimB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2cdba"/><stop offset="1" stop-color="#7c4026"/></linearGradient>
<linearGradient id="shBody" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#6fa9d8"/><stop offset="0.5" stop-color="#3f77b4"/><stop offset="1" stop-color="#244c7e"/></linearGradient>
<linearGradient id="shGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<linearGradient id="gvCol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0ecf6"/><stop offset="0.5" stop-color="#d7cfe6"/><stop offset="1" stop-color="#b3a6cd"/></linearGradient>
<linearGradient id="gvPed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efeaf6"/><stop offset="1" stop-color="#c3b6db"/></linearGradient>
<linearGradient id="gvBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7e1f1"/><stop offset="1" stop-color="#a99cc6"/></linearGradient>
<linearGradient id="mgHorn" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#ffd9a0"/><stop offset="0.5" stop-color="#f0a94e"/><stop offset="1" stop-color="#c2731f"/></linearGradient>
<linearGradient id="mgBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef2f6"/><stop offset="1" stop-color="#b7c1cd"/></linearGradient>
<linearGradient id="enHelmet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd463"/><stop offset="1" stop-color="#d79a1e"/></linearGradient>
<linearGradient id="enVest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f7cb2"/><stop offset="1" stop-color="#324a78"/></linearGradient>
`;

// ---------- domain icons (white line, drawn in illo zone) ----------
function domainIcon(kind,cx,cy,s,col){ // s ~ half-size
  const S=col,w=2.4;
  const g=(inner)=>`<g fill="none" stroke="${S}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${inner}</g>`;
  switch(kind){
    case 'laptop': return g(`<rect x="${cx-s}" y="${cy-s*0.7}" width="${2*s}" height="${1.3*s}" rx="4"/><path d="M${cx-s*1.35} ${cy+s*0.7} h${2.7*s}"/><line x1="${cx-s*0.55}" y1="${cy-s*0.35}" x2="${cx+s*0.55}" y2="${cy-s*0.35}"/><line x1="${cx-s*0.55}" y1="${cy} " x2="${cx+s*0.3}" y2="${cy}"/>`);
    case 'engineer': return g(`<circle cx="${cx}" cy="${cy-s*0.35}" r="${s*0.42}"/><path d="M${cx-s*0.62} ${cy-s*0.5} a${s*0.62} ${s*0.62} 0 0 1 ${s*1.24} 0 z"/><path d="M${cx-s*0.55} ${cy+s*0.35} q${s*0.55} -${s*0.35} ${s*1.1} 0 v${s*0.85} h-${s*1.1} z"/><line x1="${cx}" y1="${cy+s*0.35}" x2="${cx}" y2="${cy+s*1.2}"/>`);
    case 'megaphone': return g(`<path d="M${cx-s} ${cy} l${s*1.5} -${s*0.7} v${s*1.4} z"/><path d="M${cx+s*0.5} ${cy-s*0.5} a${s*0.55} ${s*0.55} 0 0 1 0 ${s} "/><line x1="${cx-s*0.6}" y1="${cy+s*0.3}" x2="${cx-s*0.6}" y2="${cy+s}"/>`);
    case 'building': return g(`<path d="M${cx-s} ${cy-s*0.35} L${cx} ${cy-s} L${cx+s} ${cy-s*0.35} z"/><line x1="${cx-s} " y1="${cy-s*0.35}" x2="${cx-s}" y2="${cy+s*0.7}"/><line x1="${cx-s*0.5}" y1="${cy-s*0.35}" x2="${cx-s*0.5}" y2="${cy+s*0.7}"/><line x1="${cx}" y1="${cy-s*0.35}" x2="${cx}" y2="${cy+s*0.7}"/><line x1="${cx+s*0.5}" y1="${cy-s*0.35}" x2="${cx+s*0.5}" y2="${cy+s*0.7}"/><line x1="${cx+s}" y1="${cy-s*0.35}" x2="${cx+s}" y2="${cy+s*0.7}"/><line x1="${cx-s*1.15}" y1="${cy+s*0.7}" x2="${cx+s*1.15}" y2="${cy+s*0.7}"/>`);
    case 'gears': return g(`<circle cx="${cx}" cy="${cy}" r="${s*0.7}"/><circle cx="${cx}" cy="${cy}" r="${s*0.28}"/>`+[0,45,90,135,180,225,270,315].map(a=>{const r1=s*0.7,r2=s*0.95,x1=cx+r1*Math.cos(a*Math.PI/180),y1=cy+r1*Math.sin(a*Math.PI/180),x2=cx+r2*Math.cos(a*Math.PI/180),y2=cy+r2*Math.sin(a*Math.PI/180);return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`}).join(''));
    case 'shield': return g(`<path d="M${cx} ${cy-s} l${s*0.9} ${s*0.35} v${s*0.7} q0 ${s*0.8} -${s*0.9} ${s*1.1} q-${s*0.9} -${s*0.3} -${s*0.9} -${s*1.1} v-${s*0.7} z"/><path d="M${cx-s*0.4} ${cy+s*0.1} l${s*0.3} ${s*0.3} l${s*0.6} -${s*0.6}"/>`);
    default: return '';
  }
}
// hub row line icons (white)
function hubIcon(kind,cx,cy,s){
  const g=i=>`<g fill="none" stroke="#EAF1FF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${i}</g>`;
  switch(kind){
    case 'form': return g(`<rect x="${cx-s*0.7}" y="${cy-s}" width="${s*1.4}" height="${s*2}" rx="3"/><rect x="${cx-s*0.35}" y="${cy-s*1.25}" width="${s*0.7}" height="${s*0.5}" rx="2"/><line x1="${cx-s*0.4}" y1="${cy-s*0.2}" x2="${cx+s*0.4}" y2="${cy-s*0.2}"/><line x1="${cx-s*0.4}" y1="${cy+s*0.3}" x2="${cx+s*0.2}" y2="${cy+s*0.3}"/>`);
    case 'monitor': return g(`<rect x="${cx-s}" y="${cy-s*0.8}" width="${s*2}" height="${s*1.4}" rx="3"/><line x1="${cx}" y1="${cy+s*0.6}" x2="${cx}" y2="${cy+s}"/><line x1="${cx-s*0.5}" y1="${cy+s}" x2="${cx+s*0.5}" y2="${cy+s}"/><path d="M${cx-s*0.5} ${cy+s*0.1} l${s*0.4} -${s*0.4} l${s*0.35} ${s*0.25} l${s*0.5} -${s*0.5}"/>`);
    case 'shieldm': return g(`<path d="M${cx} ${cy-s} l${s*0.85} ${s*0.33} v${s*0.65} q0 ${s*0.75} -${s*0.85} ${s*1.0} q-${s*0.85} -${s*0.25} -${s*0.85} -${s*1.0} v-${s*0.65} z"/><path d="M${cx-s*0.35} ${cy+s*0.05} l${s*0.28} ${s*0.28} l${s*0.55} -${s*0.55}"/>`);
    case 'share': return g(`<circle cx="${cx-s*0.7}" cy="${cy}" r="${s*0.32}"/><circle cx="${cx+s*0.6}" cy="${cy-s*0.7}" r="${s*0.32}"/><circle cx="${cx+s*0.6}" cy="${cy+s*0.7}" r="${s*0.32}"/><line x1="${cx-s*0.4}" y1="${cy-s*0.12}" x2="${cx+s*0.3}" y2="${cy-s*0.55}"/><line x1="${cx-s*0.4}" y1="${cy+s*0.12}" x2="${cx+s*0.3}" y2="${cy+s*0.55}"/>`);
    case 'lock': return g(`<rect x="${cx-s*0.7}" y="${cy-s*0.2}" width="${s*1.4}" height="${s*1.1}" rx="3"/><path d="M${cx-s*0.4} ${cy-s*0.2} v-${s*0.4} a${s*0.4} ${s*0.4} 0 0 1 ${s*0.8} 0 v${s*0.4}"/>`);
    default:return '';
  }
}

// ---------- 第 4 階高擬真主圖(200x150 座標，於卡內縮放置中) ----------
function richIllo(kind){
  switch(kind){
    case 'laptop': return `<ellipse cx="100" cy="132" rx="80" ry="9" fill="#1a2540" opacity="0.16"/>`+
      `<rect x="46" y="22" width="108" height="74" rx="7" fill="url(#lpBody)" stroke="#8592a6" stroke-width="1"/>`+
      `<rect x="53" y="29" width="94" height="60" rx="4" fill="url(#lpScreen)"/>`+
      `<g opacity="0.92"><rect x="60" y="66" width="8" height="16" rx="2" fill="#4f7fd0"/><rect x="72" y="58" width="8" height="24" rx="2" fill="#5fb389"/><rect x="84" y="62" width="8" height="20" rx="2" fill="#e0a954"/><rect x="96" y="52" width="8" height="30" rx="2" fill="#6f8fd6"/><path d="M60 48q14 -8 26 2t28 -6" fill="none" stroke="#8fd0ff" stroke-width="2"/><circle cx="112" cy="40" r="2.4" fill="#fff"/></g>`+
      `<rect x="53" y="29" width="94" height="26" rx="4" fill="#fff" opacity="0.06"/>`+
      `<path d="M34 96h132l14 20a4 4 0 0 1-4 6H24a4 4 0 0 1-4-6z" fill="url(#lpBase)" stroke="#8592a6" stroke-width="1"/>`+
      `<rect x="86" y="99" width="28" height="4" rx="2" fill="#9aa7ba"/><path d="M30 118h140" stroke="#fff" stroke-width="1.5" opacity="0.5"/>`;
    case 'gears': return `<ellipse cx="104" cy="132" rx="78" ry="9" fill="#1a2540" opacity="0.15"/>`+
      `<g transform="translate(78,66)"><circle r="42" fill="none" stroke="url(#ggRim)" stroke-width="13" stroke-dasharray="10 7.4"/><circle r="37" fill="url(#ggA)"/><circle r="26" fill="none" stroke="#1d2f50" stroke-width="5" opacity="0.35"/><circle r="13" fill="#22375d"/><circle r="6" fill="#14213a"/><path d="M-30 -8a37 37 0 0 1 30 -24" fill="none" stroke="#e9f0ff" stroke-width="5" stroke-linecap="round" opacity="0.55"/></g>`+
      `<g transform="translate(140,96)"><circle r="27" fill="none" stroke="url(#ggRimB)" stroke-width="10" stroke-dasharray="8 6"/><circle r="23" fill="url(#ggB)"/><circle r="15" fill="none" stroke="#5c2f1b" stroke-width="4" opacity="0.35"/><circle r="8" fill="#6d3822"/><circle r="3.5" fill="#3f2012"/><path d="M-18 -6a23 23 0 0 1 18 -15" fill="none" stroke="#ffe6d8" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/></g>`;
    case 'shield': return `<ellipse cx="100" cy="136" rx="46" ry="7" fill="#1a2540" opacity="0.16"/>`+
      `<path d="M100 20l44 15v34c0 32-22 48-44 57-22-9-44-25-44-57V35z" fill="url(#shBody)" stroke="#1c3c63" stroke-width="1.5"/>`+
      `<path d="M100 20l44 15v34c0 32-22 48-44 57z" fill="#000" opacity="0.10"/>`+
      `<path d="M100 24l38 13v30c0 15-6 26-16 34" fill="url(#shGloss)"/>`+
      `<path d="M78 74l16 16 30-32" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`+
      `<path d="M78 74l16 16 30-32" fill="none" stroke="#bfe0ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'building': return `<ellipse cx="100" cy="134" rx="76" ry="8" fill="#2a1f45" opacity="0.14"/>`+
      `<path d="M100 26l58 26H42z" fill="url(#gvPed)" stroke="#9c8fbe" stroke-width="1"/><path d="M100 26l58 26H100z" fill="#000" opacity="0.08"/>`+
      `<rect x="44" y="52" width="112" height="10" fill="url(#gvBase)"/>`+
      `<g fill="url(#gvCol)" stroke="#9c8fbe" stroke-width="0.6"><rect x="52" y="64" width="14" height="52" rx="2"/><rect x="74" y="64" width="14" height="52" rx="2"/><rect x="96" y="64" width="14" height="52" rx="2"/><rect x="118" y="64" width="14" height="52" rx="2"/><rect x="140" y="64" width="14" height="52" rx="2"/></g>`+
      `<rect x="42" y="116" width="116" height="6" fill="url(#gvBase)"/><rect x="36" y="122" width="128" height="7" fill="#b7abd2"/><rect x="30" y="129" width="140" height="7" fill="#a294c1"/><path d="M44 55h112" stroke="#fff" stroke-width="1" opacity="0.5"/>`;
    case 'megaphone': return `<ellipse cx="104" cy="128" rx="60" ry="8" fill="#2a1f10" opacity="0.14"/>`+
      `<path d="M78 92q-6 18 8 22" fill="none" stroke="#8a97a6" stroke-width="8" stroke-linecap="round"/>`+
      `<path d="M60 60l70-26v58l-70-22z" fill="url(#mgHorn)" stroke="#a9631a" stroke-width="1.5"/>`+
      `<ellipse cx="130" cy="63" rx="9" ry="29" fill="#ffe6c2"/><ellipse cx="130" cy="63" rx="9" ry="29" fill="none" stroke="#c2731f" stroke-width="1.5"/>`+
      `<rect x="48" y="54" width="18" height="24" rx="4" fill="url(#mgBody)" stroke="#94a0ad" stroke-width="1"/>`+
      `<path d="M64 40l4 -8m6 12l6 -10m4 16l7 -9" stroke="#f0a94e" stroke-width="3" stroke-linecap="round" opacity="0.8"/><path d="M66 42l60 -22" stroke="#fff" stroke-width="2" opacity="0.4"/>`;
    case 'engineer': return `<ellipse cx="100" cy="138" rx="42" ry="7" fill="#1a2540" opacity="0.15"/>`+
      `<path d="M72 138q0 -40 28 -40t28 40z" fill="url(#enVest)"/><path d="M92 100h16v38h-16z" fill="#dfe6ef" opacity="0.5"/><rect x="78" y="118" width="44" height="7" fill="#ffd463"/>`+
      `<circle cx="100" cy="72" r="20" fill="#f2d3b6"/><path d="M84 66a16 16 0 0 1 32 0z" fill="#e9c19f" opacity="0.5"/>`+
      `<path d="M78 66a22 18 0 0 1 44 0z" fill="url(#enHelmet)" stroke="#b9821a" stroke-width="1"/><rect x="74" y="64" width="52" height="6" rx="3" fill="#e0a92e"/><rect x="97" y="50" width="6" height="12" rx="2" fill="#c99320"/><path d="M84 58a18 14 0 0 1 20 -6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`;
    default: return '';
  }
}

// ---------- start ----------
P(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Noto Sans TC, Microsoft JhengHei, sans-serif">`);
P(`<defs>${DEFS}</defs>`);
// 三級：1 線框 / 2 立體(裝飾預設開) / 3 素材場景(素材+天際線預設開)。裝飾、場景可用 DECOR/SCENE 環境變數覆寫開關。
const wire=LEVEL===1;
const decor = process.env.DECOR!==undefined ? process.env.DECOR==='1' : LEVEL>=2;
const scene = process.env.SCENE!==undefined ? process.env.SCENE==='1' : LEVEL>=3;
const useAssets = LEVEL>=3;
P(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

// 背景裝飾層
if(decor){
  P(`<circle cx="880" cy="240" r="150" fill="#EAF1FA" opacity="0.5"/>`);
  P(`<circle cx="300" cy="820" r="90" fill="#EAF6EF" opacity="0.45"/>`);
  P(`<circle cx="1480" cy="800" r="90" fill="#F6ECEC" opacity="0.4"/>`);
}
// 場景層：城市天際線(含白色窗格的剪影，寬窄錯落；非長條圖)
if(scene){
  let sky='';
  const widths=[52,66,80], heights=[70,110,150,90,130,170,100,150,120,180,88,140];
  let x=0,k=0;
  while(x<W){
    const bw=widths[k%3], bh=heights[k%heights.length], by=H-bh;
    sky+=`<rect x="${x}" y="${by}" width="${bw}" height="${bh}" fill="#D6E1F0"/>`;
    for(let wy=by+12; wy<H-10; wy+=18)
      for(let wx=x+8; wx<x+bw-6; wx+=16)
        sky+=`<rect x="${wx}" y="${wy}" width="6" height="8" fill="#FFFFFF" opacity="0.7"/>`;
    x+=bw+8; k++;
  }
  P(`<g>${sky}</g>`);
}

// title
P(`<text x="${W/2}" y="66" font-size="40" font-weight="900" fill="${TITLE}" text-anchor="middle">○○ 資訊系統　角色架構圖</text>`);
P(`<line x1="${W/2-190}" y1="86" x2="${W/2+190}" y2="86" stroke="#3E7BFA" stroke-width="2.5"/><circle cx="${W/2-190}" cy="86" r="4" fill="#3E7BFA"/><circle cx="${W/2+190}" cy="86" r="4" fill="#3E7BFA"/>`);

// ---------- layout ----------
const colW=500,innerPad=18,titleH=56,rowH=40,rowGap=11,cardGap=22,bodyGap=14;
const leftX=40,rightX=W-40-colW,colTop=140;
const hubW=490,hubX=(W-hubW)/2;
const illoRatio=0.35;

function card(x,y,c){
  const R=ROLE[c.color], rows=c.rows,n=rows.length;
  const inner=colW-2*innerPad, illoW=Math.round(illoRatio*inner),gap=16,listW=inner-illoW-gap;
  const listH=n*rowH+(n-1)*rowGap, bodyH=Math.max(listH,170);
  const cardH=titleH+bodyGap+bodyH+2*innerPad;
  // thickness edge (L2+)
  if(!wire) P(`<rect x="${x}" y="${y+6}" width="${colW}" height="${cardH}" rx="18" fill="${R.main}" opacity="0.16"/>`);
  const dash=c.reserved?` stroke-dasharray="9 7"`:'';
  P(`<rect x="${x}" y="${y}" width="${colW}" height="${cardH}" rx="18" fill="${wire?'#fff':`url(#${R.band})`}" stroke="${c.reserved?FAINT:R.main}" stroke-width="2"${dash} ${wire?'':'filter="url(#shadow)"'}/>`);
  // title
  const bx=x+innerPad+22,by=y+innerPad+22;
  if(wire){P(`<circle cx="${bx}" cy="${by}" r="22" fill="none" stroke="${FAINT}" stroke-width="2"/>`);}
  else{P(`<circle cx="${bx}" cy="${by}" r="22" fill="url(#${R.sph})" filter="url(#obj)"/><ellipse cx="${bx-6}" cy="${by-7}" rx="8" ry="5" fill="#fff" opacity="0.4"/>`);}
  P(domainIcon(c.icon,bx,by,11,'#fff'));
  P(`<text x="${x+innerPad+56}" y="${y+innerPad+18}" font-size="22" font-weight="800" fill="${c.reserved?'#6B7688':R.deep}">${esc(c.title)}</text>`);
  // pill
  const pw=Math.min(250,26+c.pill.length*15.5);
  if(wire){P(`<rect x="${x+innerPad+56}" y="${y+innerPad+30}" width="${pw}" height="24" rx="12" fill="none" stroke="${FAINT}" stroke-width="1.3"/><text x="${x+innerPad+56+pw/2}" y="${y+innerPad+46}" font-size="14" fill="${MUT}" text-anchor="middle">${esc(c.pill)}</text>`);}
  else{P(`<rect x="${x+innerPad+56}" y="${y+innerPad+30}" width="${pw}" height="24" rx="12" fill="url(#${c.reserved?'gHdrGray':R.hdr})" filter="url(#row)"/><text x="${x+innerPad+56+pw/2}" y="${y+innerPad+46}" font-size="14.5" font-weight="700" fill="#fff" text-anchor="middle">${esc(c.pill)}</text>`);}
  // body
  const bodyY=y+innerPad+titleH+bodyGap;
  const illoX=c.side==='L'?x+innerPad:x+innerPad+listW+gap;
  const listX=c.side==='L'?x+innerPad+illoW+gap:x+innerPad;
  // illo zone
  const icx=illoX+illoW/2,icy=bodyY+bodyH/2, iconCol=wire?FAINT:R.deep;
  if(useAssets){ // embed asset
    const asset={laptop:'P01_laptop-dashboard.png',engineer:'P13_engineer-helmet.png',megaphone:'PX_megaphone.png',building:'P14_gov-building.png',gears:'P02_gears.png',shield:'P05_security-shield.png'}[c.icon];
    const fp=path.join(ASSETS,asset);
    try{const b64=fs.readFileSync(fp).toString('base64');
      P(`<image x="${illoX}" y="${bodyY+bodyH*0.08}" width="${illoW}" height="${bodyH*0.84}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${b64}"/>`);
    }catch(e){P(domainIcon(c.icon,icx,icy,34,iconCol));}
  } else if(wire){
    P(`<rect x="${illoX}" y="${bodyY}" width="${illoW}" height="${bodyH}" rx="12" fill="none" stroke="${FAINT}" stroke-width="1.4" stroke-dasharray="5 4"/>`);
    P(domainIcon(c.icon,icx,icy,32,FAINT));
  } else {
    // L2：漸層底盤 + 第 4 階高擬真主圖(縮放置中)
    const ig={blue:'gIlloB',green:'gIlloG',orange:'gIlloO',purple:'gIlloP',red:'gIlloR',gray:'gIlloN'}[c.color];
    P(`<rect x="${illoX}" y="${bodyY}" width="${illoW}" height="${bodyH}" rx="12" fill="url(#${ig})" stroke="${R.edge}" stroke-width="1.5"/>`);
    const s=Math.min(illoW/200, bodyH/150)*0.92;
    const tx=illoX+(illoW-200*s)/2, ty=bodyY+(bodyH-150*s)/2;
    P(`<g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${s.toFixed(3)})">${richIllo(c.icon)}</g>`);
  }
  // rows
  rows.forEach((r,i)=>{
    const ry=bodyY+i*(rowH+rowGap);
    const rdash=r.res?` stroke-dasharray="5 4"`:'';
    P(`<rect x="${listX}" y="${ry}" width="${listW}" height="${rowH}" rx="10" fill="${wire?'#fff':'#fff'}" stroke="${r.res?FAINT:R.edge}" stroke-width="1.4"${rdash} ${wire?'':'filter="url(#row)"'}/>`);
    if(r.res){P(`<g transform="translate(${listX+11},${ry+rowH/2-10})" style="color:${FAINT}"><use href="#clk" width="20" height="20"/></g>`);
      P(`<text x="${listX+40}" y="${ry+rowH/2+5}" font-size="16" fill="${FAINT}">${esc(r.t)}</text>`);}
    else{P(`<g transform="translate(${listX+11},${ry+rowH/2-10})" style="color:${wire?FAINT:R.main}"><use href="#chk" width="20" height="20"/></g>`);
      P(`<text x="${listX+40}" y="${ry+rowH/2+5}" font-size="16" fill="${INK}">${esc(r.t)}</text>`);}
  });
  return {h:cardH,inX:c.side==='L'?x+colW:x,cy:y+cardH/2};
}

// data
// ===== 示範資料(中性範例;他案整段替換此區)=====
const leftCards=[
 {color:'blue',icon:'laptop',title:'一般使用者',pill:'前台｜免註冊快速使用',side:'L',rows:[{t:'線上申請與表單填報'},{t:'進度追蹤・補件回覆'},{t:'通知・智慧客服'}]},
 {color:'green',icon:'engineer',title:'專業／委外人員',pill:'前台｜帳號申請＋後台審核',side:'L',rows:[{t:'代辦案件申請與管理'},{t:'資格／執照維護'},{t:'後續階段作業',res:true}]},
 {color:'orange',icon:'megaphone',title:'公眾／通報者',pill:'通報來源｜公開入口',side:'L',rows:[{t:'問題通報'},{t:'公開資訊查詢'}]},
];
const rightCards=[
 {color:'purple',icon:'building',title:'機關承辦',pill:'後台｜員工入口 SSO',side:'R',rows:[{t:'案件受理・退補・線上簽核'},{t:'案件管理・作業紀錄'},{t:'時效預警・統計看板'},{t:'帳號審核'}]},
 {color:'red',icon:'gears',title:'系統管理者',pill:'後台｜多因子驗證＋覆核',side:'R',rows:[{t:'權限設定・覆核核可'},{t:'系統參數・排程管理'},{t:'監控・稽核日誌'}]},
 {color:'gray',icon:'shield',title:'稽核／檢查單位',pill:'後續啟用(預留)',side:'R',reserved:true,rows:[{t:'稽核紀錄・查核',res:true},{t:'案件核轉',res:true}]},
];

// hub geometry
const hubH=470,hubTop=(H-hubH)/2+26,hubCX=hubX+hubW/2,hubLX=hubX,hubRX=hubX+hubW;
const hubNodeY=[hubTop+150,hubTop+250,hubTop+350];

// place + collect nodes
const nodesL=[],nodesR=[];let cy=colTop;
const leftSvg=[],rightSvg=[];
for(const c of leftCards){const save=o.length;const r=card(leftX,cy,c);nodesL.push({x:r.inX,y:r.cy});cy+=r.h+cardGap;}
cy=colTop;for(const c of rightCards){const r=card(rightX,cy,c);nodesR.push({x:r.inX,y:r.cy});cy+=r.h+cardGap;}

// connectors (draw before hub so hub covers ends)
function conn(from,tox,toy){
  const midX=(from.x+tox)/2;
  P(`<path d="M${from.x} ${from.y} H${midX} V${toy} H${tox}" fill="none" stroke="#9AA7C8" stroke-width="2" stroke-dasharray="2 6"/>`);
  P(`<circle cx="${from.x}" cy="${from.y}" r="5.5" fill="#9AA7C8"/>`);
  P(`<circle cx="${tox}" cy="${toy}" r="6" fill="#fff" stroke="#3E7BFA" stroke-width="2.5"/>`);
}
nodesL.forEach((nd,i)=>conn(nd,hubLX,hubNodeY[i]));
nodesR.forEach((nd,i)=>conn(nd,hubRX,hubNodeY[i]));

// hub card (原始淺青綠配色，不改色；僅保留 hub-spoke 連接節點)
const TEAL='#0E3A44',TEALB='#1F5766',TEALS='#4B6570';
P(`<rect x="${hubX}" y="${hubTop}" width="${hubW}" height="${hubH}" rx="20" fill="${wire?'#fff':'url(#gCore)'}" stroke="${wire?FAINT:TEALB}" stroke-width="2" ${wire?'':'filter="url(#shadow)"'}/>`);
// 左上徽章 + 標題(原樣式)
const cbx=hubX+46,cby=hubTop+42;
if(wire){P(`<circle cx="${cbx}" cy="${cby}" r="22" fill="none" stroke="${FAINT}" stroke-width="2"/>`);}
else{P(`<circle cx="${cbx}" cy="${cby}" r="22" fill="url(#sCore)" filter="url(#obj)"/><ellipse cx="${cbx-6}" cy="${cby-7}" rx="8" ry="5" fill="#fff" opacity="0.34"/>`);}
P(`<g transform="translate(${cbx-11},${cby-11})" fill="none" stroke="${wire?FAINT:'#fff'}" stroke-width="2"><circle cx="12" cy="6" r="2.4"/><circle cx="6" cy="17" r="2.4"/><circle cx="18" cy="17" r="2.4"/><path d="M11 8l-4 7M13 8l4 7M8.4 17h7.2"/></g>`);
P(`<text x="${hubX+80}" y="${hubTop+40}" font-size="25" font-weight="900" fill="${TEAL}">核心系統平台</text>`);
P(`<text x="${hubX+80}" y="${hubTop+65}" font-size="14.5" font-weight="500" fill="${TEALS}">全生命週期資料模型｜OIDC SSO</text>`);
const hubRows=['案件申請平台（申請・受理）','通報／查詢平台（通報・處理）','系統管理中心（權限・稽核・監控）','介接整合（外部機關・入口網）'];
const hrx=hubX+28,hrw=hubW-56;let hry=hubTop+92;const hrh=48,hrg=12;
hubRows.forEach(t=>{
  if(wire){P(`<rect x="${hrx}" y="${hry}" width="${hrw}" height="${hrh}" rx="11" fill="#fff" stroke="${FAINT}" stroke-width="1.4"/><text x="${hubCX}" y="${hry+hrh/2+6}" font-size="18" font-weight="700" fill="${TEAL}" text-anchor="middle">${esc(t)}</text>`);}
  else{P(`<g filter="url(#hdr)"><rect x="${hrx}" y="${hry}" width="${hrw}" height="${hrh}" rx="11" fill="url(#gCoreBar)"/></g><ellipse cx="${hubCX}" cy="${hry+9}" rx="${hrw/2-18}" ry="6" fill="#fff" opacity="0.10"/><text x="${hubCX}" y="${hry+hrh/2+6}" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${esc(t)}</text>`);}
  hry+=hrh+hrg;
});
hry+=4;
P(`<g ${wire?'':'filter="url(#card2)"'}><rect x="${hrx}" y="${hry}" width="${hrw}" height="76" rx="13" fill="#fff" stroke="${wire?FAINT:TEALB}" stroke-width="2"/></g>`);
P(`<text x="${hubCX}" y="${hry+31}" font-size="17.5" font-weight="800" fill="${TEAL}" text-anchor="middle">三階權限 RBAC＋覆核管理</text>`);
P(`<text x="${hubCX}" y="${hry+57}" font-size="15" font-weight="600" fill="${INK}" text-anchor="middle">系統管理者 → 角色管理員 → 角色（讀／編／刪）</text>`);

// caption + legend
P(`<text x="${hubCX}" y="${hubTop+hubH+30}" font-size="15" fill="${MUT}" text-anchor="middle">— 各角色依權限正向表列存取對應模組・全程數位足跡留痕 —</text>`);
P(`<g font-size="14" fill="${MUT}">`);
P(`<line x1="${W/2-240}" y1="${H-30}" x2="${W/2-205}" y2="${H-30}" stroke="${INK}" stroke-width="3"/><text x="${W/2-198}" y="${H-25}">實線＝本案範圍</text>`);
P(`<line x1="${W/2+20}" y1="${H-30}" x2="${W/2+55}" y2="${H-30}" stroke="${FAINT}" stroke-width="2" stroke-dasharray="6 5"/><g transform="translate(${W/2+62},${H-40})" style="color:${FAINT}"><use href="#clk" width="18" height="18"/></g><text x="${W/2+86}" y="${H-25}">虛線＋時鐘＝後續擴充</text>`);
P(`</g>`);
P(`</svg>`);
fs.writeFileSync(OUT,o.join('\n'));
console.log('L'+LEVEL+' ->',OUT);
