// [工具] 多模態場景式素材:風格參考圖 + 內容 prompt → 一整組會呼應文字的等角場景(材質走不透明霧面以利去背)。
// 用法: GKEY=$KEY node gen_scene.js <參考圖> <prompt檔|字串> <輸出.png>。見 asset-generation.md「場景式素材」。
// 多模態場景生成:把參考圖(風格) + 文字prompt 一起送 Gemini,產「一組會呼應文字的等角場景」。
// 用法: GKEY=$KEY node gen_scene.js <參考圖.png> <prompt檔.txt|"inline prompt"> <輸出.png>
// 選填環境變數:IMG_AR(輸出比例,如 3:2、21:9)、IMG_SIZE(1K|2K|4K)。
// 成功產出會把 prompt/model/參考圖檔名寫入輸出目錄 prompts.json(與 gen_assets.js 同格式)。
const fs=require('fs'),path=require('path'),https=require('https');
const KEY=process.env.GKEY||process.env.GEMINI_API_KEY;
const REF=process.argv[2], PROMPT_ARG=process.argv[3], OUT=process.argv[4];
const MODEL=process.env.GEMINI_MODEL||'gemini-3-pro-image'; // 場景式走 Nano Banana Pro;2.5-flash-image 已 legacy(2026-08)
if(!KEY){console.error('缺金鑰(GKEY)');process.exit(1);}
if(!REF||!PROMPT_ARG||!OUT){console.error('用法: node gen_scene.js 參考圖 prompt 輸出.png');process.exit(1);}
const prompt = fs.existsSync(PROMPT_ARG) ? fs.readFileSync(PROMPT_ARG,'utf8') : PROMPT_ARG;
const refB64 = fs.readFileSync(REF).toString('base64');
const refMime = REF.toLowerCase().endsWith('.jpg')||REF.toLowerCase().endsWith('.jpeg')?'image/jpeg':'image/png';

function post(host,path,headers,body){return new Promise(res=>{
  const req=https.request({hostname:host,path,method:'POST',headers},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({status:r.statusCode,body:d}));});
  req.on('error',e=>res({status:0,body:JSON.stringify({error:{message:e.message}})}));req.write(body);req.end();
});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function savePrompt(){
  const pj=path.join(path.dirname(OUT)||'.','prompts.json');
  let saved=[]; try{ saved=JSON.parse(fs.readFileSync(pj,'utf8')); }catch(e){}
  const file=path.basename(OUT);
  saved=saved.filter(s=>s.file!==file);
  const rec={file,provider:'gemini',model:MODEL,type:'scene',ref:path.basename(REF),prompt};
  if(process.env.IMG_AR||process.env.IMG_SIZE) rec.imageConfig={...(process.env.IMG_AR&&{aspectRatio:process.env.IMG_AR}),...(process.env.IMG_SIZE&&{imageSize:process.env.IMG_SIZE})};
  saved.push(rec);
  fs.writeFileSync(pj,JSON.stringify(saved,null,2));
  console.log('prompt 已存:',pj);
}

(async()=>{
  const gc={responseModalities:["Image"]};
  if(process.env.IMG_AR||process.env.IMG_SIZE){
    gc.imageConfig={};
    if(process.env.IMG_AR) gc.imageConfig.aspectRatio=process.env.IMG_AR;
    if(process.env.IMG_SIZE) gc.imageConfig.imageSize=process.env.IMG_SIZE;
  }
  const body=JSON.stringify({contents:[{parts:[
    {inlineData:{mimeType:refMime,data:refB64}},
    {text:prompt}
  ]}],generationConfig:gc});
  for(let i=0;i<6;i++){
    const r=await post('generativelanguage.googleapis.com',`/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},body);
    if(r.status===200){
      const j=JSON.parse(r.body);
      const parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
      const img=parts.find(p=>p.inlineData||p.inline_data);
      if(img){fs.writeFileSync(OUT,Buffer.from((img.inlineData||img.inline_data).data,'base64'));console.log('OK',OUT);savePrompt();return;}
      console.log('no-img',r.body.slice(0,160));
    } else console.log('retry',r.status,r.body.slice(0,160));
    await sleep(8000+i*4000);
  }
  console.error('FAILED');process.exit(1);
})();
