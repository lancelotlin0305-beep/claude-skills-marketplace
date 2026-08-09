#!/usr/bin/env node
/*
 通用純色 chroma-key 去背 → 透明 PNG,並自動裁切到不透明邊界。
 不限洋紅:可指定任意背景色,或自動偵測四角背景色。適用「不透明物件放在單色平背景」的素材。
 用法:
   NODE_PATH=$(npm root -g) node chroma_key.js <素材目錄> [檔名...] [--bg=#FF00FF] [--tol=70] [--loose] [--pad=8] [--alpha=20]
   不給檔名 = 處理目錄下全部 *.png(略過 _ 開頭)
   --bg=#hex : 指定要挖掉的背景色;省略則自動偵測四角眾色
   --tol=N   : 顏色距離門檻(預設 70;越大挖越多)。--loose 等同拉高門檻
   --pad=N   : 裁切邊界外擴(預設 8)
   --alpha=N : 判定「屬於物件」的 alpha 門檻(預設 20;淺色物件邊緣被裁時降到 8–12)
 注意:半透明玻璃無法乾淨去背(背景色會透進物件)——玻璃素材請改「不透明霧面」再產,或走 OpenAI 真透明。
*/
const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const args=process.argv.slice(2);
const loose=args.includes('--loose');
const getOpt=(name,def)=>{ const a=args.find(x=>x.startsWith(name+'=')); return a?a.split('=')[1]:def; };
const PAD=parseInt(getOpt('--pad','8'),10);
const ALPHA=parseInt(getOpt('--alpha','20'),10);
const TOL=parseInt(getOpt('--tol', loose?'110':'70'),10);
const BGHEX=getOpt('--bg',null);   // 例 #FF00FF;null=自動偵測
function hex2rgb(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
const BG = BGHEX ? hex2rgb(BGHEX) : null;
const rest=args.filter(a=>a!=='--loose'&&!a.startsWith('--'));
const DIR=rest[0]; const named=rest.slice(1);
if(!DIR){ console.error('用法: node chroma_key.js 素材目錄 [檔名...] [--bg=#hex] [--tol=70] [--loose] [--pad=8] [--alpha=20]'); process.exit(1); }
const files = named.length ? named : fs.readdirSync(DIR).filter(f=>/\.png$/i.test(f)&&!f.startsWith('_'));

(async()=>{
  const b=await chromium.launch(); const p=await b.newPage();
  for(const f of files){
    const data=fs.readFileSync(path.join(DIR,f)).toString('base64');
    const out=await p.evaluate(async({u,BG,TOL,PAD,ALPHA})=>{
      const img=new Image(); img.src=u; await img.decode();
      const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const x=c.getContext('2d'); x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height); const a=d.data, W=c.width, Hh=c.height;
      // 決定背景色:指定值,或取四角 16px 方塊平均
      let key=BG;
      if(!key){
        let rs=0,gs=0,bs=0,ct=0; const S=16;
        const corners=[[0,0],[W-S,0],[0,Hh-S],[W-S,Hh-S]];
        for(const [cx,cy] of corners) for(let yy=0;yy<S;yy++) for(let xx=0;xx<S;xx++){
          const idx=((cy+yy)*W+(cx+xx))*4; rs+=a[idx];gs+=a[idx+1];bs+=a[idx+2];ct++;
        }
        key=[Math.round(rs/ct),Math.round(gs/ct),Math.round(bs/ct)];
      }
      const [kr,kg,kb]=key, FEATHER=42;
      for(let i=0;i<a.length;i+=4){
        const dr=a[i]-kr, dg=a[i+1]-kg, db=a[i+2]-kb;
        const dist=Math.sqrt(dr*dr+dg*dg+db*db);
        if(dist<TOL){ a[i+3]=0; }
        else if(dist<TOL+FEATHER){
          const t=(dist-TOL)/FEATHER;                 // 0..1 邊緣羽化
          a[i+3]=Math.round(a[i+3]*t);
          // 輕度去溢色:把偏向背景色的分量往中性拉一點
          a[i]=Math.round(a[i]*(0.7+0.3*t)+ (a[i]<kr?0:0));
        }
      }
      x.putImageData(d,0,0);
      let minX=W,minY=Hh,maxX=0,maxY=0;
      for(let y=0;y<Hh;y++)for(let xx=0;xx<W;xx++){const al=a[(y*W+xx)*4+3];if(al>ALPHA){if(xx<minX)minX=xx;if(xx>maxX)maxX=xx;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
      if(maxX<minX){ return c.toDataURL('image/png'); } // 全透明保護
      minX=Math.max(0,minX-PAD);minY=Math.max(0,minY-PAD);maxX=Math.min(W-1,maxX+PAD);maxY=Math.min(Hh-1,maxY+PAD);
      const w=maxX-minX+1,h=maxY-minY+1;
      const c2=document.createElement('canvas'); c2.width=w; c2.height=h;
      c2.getContext('2d').drawImage(c,minX,minY,w,h,0,0,w,h);
      return c2.toDataURL('image/png');
    }, {u:'data:image/png;base64,'+data, BG, TOL, PAD, ALPHA});
    fs.writeFileSync(path.join(DIR,f), Buffer.from(out.split(',')[1],'base64'));
    console.log('keyed',f, BG?`bg=${BGHEX}`:'(auto)', `tol=${TOL} pad=${PAD} alpha=${ALPHA}`);
  }
  await b.close();
})().catch(e=>{ console.error('chroma_key 失敗:', e.message); process.exit(1); });
