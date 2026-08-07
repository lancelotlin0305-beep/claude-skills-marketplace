#!/usr/bin/env python3
"""在 Claude Code(本機、有網路)環境批次產製圖庫素材。
用法:
  export OPENAI_API_KEY=sk-...
  python generate_assets.py                 # 產全部 20 張(真透明 PNG)
  python generate_assets.py --only P01,P15  # 只產指定編號
  python generate_assets.py --quality medium # 省費用試跑(預設 high)
需求:pip install openai pillow
說明:使用 OpenAI GPT Image 模型 background="transparent" 直接輸出真透明 PNG,
     免去背;產出自動裁切至內容邊界,預設存入 ./geo-assets/(--outdir 可自訂)。
"""
import argparse, base64, json, os, sys
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--quality', default='high', choices=['low','medium','high'])
    ap.add_argument('--model', default='gpt-image-1')
    ap.add_argument('--outdir', default='./geo-assets')
    a = ap.parse_args()
    try:
        from openai import OpenAI
        from PIL import Image
        import numpy as np
    except ImportError:
        sys.exit('請先執行: pip install openai pillow numpy')
    if not os.environ.get('OPENAI_API_KEY'):
        sys.exit('請先設定 OPENAI_API_KEY 環境變數')

    here = Path(__file__).parent
    outdir = Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    items = json.load(open(here / 'asset_prompts.json'))
    only = {x.strip() for x in a.only.split(',') if x.strip()}
    client = OpenAI()

    for it in items:
        if only and it['id'] not in only: continue
        dst = outdir / f"{it['id']}_{it['name']}.png"
        print(f"[{it['id']}] 生成中 → {dst.name}")
        r = client.images.generate(model=a.model, prompt=it['prompt'],
            size='1024x1024', quality=a.quality,
            background='transparent', output_format='png')
        raw = base64.b64decode(r.data[0].b64_json)
        tmp = outdir / '_tmp.png'; tmp.write_bytes(raw)
        im = Image.open(tmp).convert('RGBA')
        arr = np.array(im)
        ys, xs = np.where(arr[..., 3] > 8)
        if len(ys):
            pad = 8
            im = im.crop((max(xs.min()-pad,0), max(ys.min()-pad,0),
                          min(xs.max()+pad, im.width), min(ys.max()+pad, im.height)))
        im.save(dst); tmp.unlink(missing_ok=True)
        print(f"  完成 {im.size}")
    print('全部完成。檢查素材後重新打包 skill 即可。')

if __name__ == '__main__':
    main()
