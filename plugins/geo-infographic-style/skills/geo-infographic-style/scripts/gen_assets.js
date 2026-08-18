#!/usr/bin/env node
/*
 統一產圖入口:依 manifest 產出「單一物件去背素材」,並把所用 prompt 存檔。
 用法:
   PROVIDER=gemini GKEY=$GEMINI_API_KEY node gen_assets.js manifest.json ./geo-assets
   PROVIDER=openai OKEY=$OPENAI_API_KEY node gen_assets.js manifest.json ./geo-assets
 manifest.json: [{ "id":"P01", "name":"laptop-dashboard", "prompt":"Professional 3D render of ..." }, ...]
   每筆可加選填 "ar":"4:5"(輸出比例,1:1~21:9/8:1 皆可)與 "size":"1K|2K|4K"(Lite 僅 1K);
   或以環境變數 IMG_AR / IMG_SIZE 設全批預設。OpenAI 路徑忽略此欄位。

 安全:金鑰只從環境變數讀,絕不寫入任何輸出檔;prompts.json 不含金鑰。
 透明背景:
   - gemini:模型不給真 alpha,本腳本會在 prompt 追加洋紅 chroma-key 背景;產後請跑 chroma_key.js 去背。
   - openai:gpt-image-1 以 background=transparent 直接輸出 alpha,免去背。
*/
const fs=require('fs'), path=require('path'), https=require('https');
const PROVIDER=(process.env.PROVIDER||'gemini').toLowerCase();
const KEY = PROVIDER==='openai' ? (process.env.OKEY||process.env.OPENAI_API_KEY)
                                : (process.env.GKEY||process.env.GEMINI_API_KEY);
const MANIFEST=process.argv[2], OUT=process.argv[3];
if(!KEY){ console.error('缺金鑰:請以環境變數傳入(GKEY/GEMINI_API_KEY 或 OKEY/OPENAI_API_KEY),勿寫進檔案'); process.exit(1); }
if(!MANIFEST||!OUT){ console.error('用法: PROVIDER=gemini GKEY=$KEY node gen_assets.js manifest.json 輸出目錄'); process.exit(1); }
fs.mkdirSync(OUT,{recursive:true});
const items=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));

const GEMINI_MODEL=process.env.GEMINI_MODEL||'gemini-3.1-flash-image'; // 2.5-flash-image 已 legacy(2026-08)
const OPENAI_MODEL=process.env.OPENAI_MODEL||'gpt-image-1';
// 輸出比例/解析度:manifest 每筆 ar/size 優先,否則取環境變數 IMG_AR/IMG_SIZE;都沒給就不帶(交模型預設)。
const IMG_AR=process.env.IMG_AR||'', IMG_SIZE=process.env.IMG_SIZE||'';
function imageConfig(it){
  const c={};
  if(it.ar||IMG_AR) c.aspectRatio=it.ar||IMG_AR;
  if(it.size||IMG_SIZE) c.imageSize=it.size||IMG_SIZE;
  return Object.keys(c).length?c:null;
}
const CHROMA=' The single object is fully opaque and centered, placed on a completely flat uniform solid chroma-key background of pure bright magenta color (hex #FF00FF) filling the entire frame edge to edge. Do NOT draw any checkerboard pattern. No ground shadow on the background.';
// R9 模板 + C1:尾句拆「核心」與「禁文字」。預設禁文字;設 ALLOW_TERMS 時改為允許少數短術語
// (承載資訊的文字仍禁,見 style-spec §5)。ALLOW_TERMS=1 泛指短代號;或給清單如 ALLOW_TERMS=AI,KPI。
const ALLOW_TERMS=process.env.ALLOW_TERMS||'';
const TAIL_CORE=' premium corporate design, semi-realistic proportions, refined studio lighting from the upper left, fully isolated single object with no background elements, sharp clean edges, product-visualization quality.';
const NOTEXT=' Strictly no text, no letters, no numbers, no logos, no watermarks.';
function withTail(p){
  let base=p.replace(/\s*Strictly no text[\s\S]*$/i,'').trimEnd();      // 去掉既有的禁文字尾句
  if(!/product-visualization quality/i.test(base)) base+=TAIL_CORE;     // 補核心尾句(已含者不重複)
  if(ALLOW_TERMS){
    const which=ALLOW_TERMS==='1'?'a short domain acronym such as AI/KPI/GIS':ALLOW_TERMS;
    return base+` No paragraph or data text; only a tiny short label (${which}) may appear if essential.`;
  }
  return base+NOTEXT;
}
// R3 文字防呆:重試時逐次加強「禁止任何文字」語氣,降低生成模型漏字機率(自動重產仍需人工驗收)。
const NOTEXT_ESCALATE=[
  '',
  ' Absolutely no text or characters of any kind anywhere on the object.',
  ' CRITICAL: the surface must be completely blank — zero text, zero labels, zero symbols, zero numbers.'
];

function post(host,pathname,headers,body){return new Promise(res=>{
  const req=https.request({hostname:host,path:pathname,method:'POST',headers},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({status:r.statusCode,body:d}));});
  req.on('error',e=>res({status:0,body:JSON.stringify({error:{message:e.message}})}));
  req.write(body);req.end();
});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function genGemini(prompt,it){
  const gc={responseModalities:["Image"]};
  const ic=imageConfig(it||{}); if(ic) gc.imageConfig=ic;
  const body=JSON.stringify({contents:[{parts:[{text:prompt+CHROMA}]}],generationConfig:gc});
  const r=await post('generativelanguage.googleapis.com',`/v1beta/models/${GEMINI_MODEL}:generateContent?key=${KEY}`,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body);
  if(r.status!==200) return {err:r.status, msg:r.body.slice(0,160)};
  const j=JSON.parse(r.body);
  const parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
  const img=parts.find(p=>p.inlineData||p.inline_data);
  return img ? {data:(img.inlineData||img.inline_data).data} : {err:'no-img', msg:r.body.slice(0,160)};
}
async function genOpenAI(prompt,_it){ // OpenAI 路徑忽略 ar/size(gpt-image-1 尺寸另有枚舉)
  const body=JSON.stringify({model:OPENAI_MODEL,prompt,size:'1024x1024',background:'transparent',n:1});
  const r=await post('api.openai.com','/v1/images/generations',{'Content-Type':'application/json','Authorization':'Bearer '+KEY,'Content-Length':Buffer.byteLength(body)},body);
  if(r.status!==200) return {err:r.status, msg:r.body.slice(0,160)};
  const j=JSON.parse(r.body);
  const b64=j.data&&j.data[0]&&j.data[0].b64_json;
  return b64 ? {data:b64} : {err:'no-img', msg:r.body.slice(0,160)};
}
const gen = PROVIDER==='openai'?genOpenAI:genGemini;
const model = PROVIDER==='openai'?OPENAI_MODEL:GEMINI_MODEL;

(async()=>{
  const manifestOut=path.join(OUT,'prompts.json');
  let saved=[]; try{ saved=JSON.parse(fs.readFileSync(manifestOut,'utf8')); }catch(e){}
  let failed=0;
  for(const it of items){
    const file=`${it.id}_${it.name}.png`;
    if(fs.existsSync(path.join(OUT,file))){ console.log('skip(exists)',file); continue; }
    const basePrompt=withTail(it.prompt);
    let ok=false;
    for(let i=0;i<6;i++){
      // 重試時追加升級版禁文字語氣(前 3 次遞增,之後維持最強)。
      const prompt=basePrompt+(ALLOW_TERMS?'':NOTEXT_ESCALATE[Math.min(i,NOTEXT_ESCALATE.length-1)]);
      const r=await gen(prompt,it);
      if(r.data){ fs.writeFileSync(path.join(OUT,file),Buffer.from(r.data,'base64')); console.log('OK',file); ok=true; break; }
      console.log('retry',file,r.err,r.msg||''); await sleep(8000+i*4000);
    }
    if(!ok){ console.log('FAILED',file); failed++; continue; }
    // 留存 prompt(不含金鑰)
    saved=saved.filter(s=>s.file!==file);
    const rec={id:it.id,name:it.name,file,provider:PROVIDER,model,prompt:basePrompt};
    const ic=imageConfig(it); if(ic&&PROVIDER!=='openai') rec.imageConfig=ic;
    saved.push(rec);
    fs.writeFileSync(manifestOut,JSON.stringify(saved,null,2));
    await sleep(3000);
  }
  console.log('prompts 已存:',manifestOut);
  if(PROVIDER!=='openai') console.log('下一步:跑 chroma_key.js 去背');
  if(failed>0){ console.error(`有 ${failed} 張產圖失敗`); process.exit(1); }
})().catch(e=>{ console.error('gen_assets 失敗:', e.message); process.exit(1); });
