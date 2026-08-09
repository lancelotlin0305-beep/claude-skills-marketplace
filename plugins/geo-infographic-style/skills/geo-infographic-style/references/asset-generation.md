# 素材取得與 AI 產圖流程(第 3 級專用)

當使用者選擇 **第 3 級(素材場景)**,或任何等級明確要求嵌入「擬真去背素材」時,依本文件走完整流程再進入繪製。**整張圖永不交由影像生成模型重繪;AI 只產「單一物件去背素材」,文字與版面 100% 由 SVG 負責。**

> **安全鐵則**:API 金鑰**一律從環境變數讀取**(`GEMINI_API_KEY` / `OPENAI_API_KEY`),**嚴禁**寫進任何 skill 檔案、腳本、SVG、圖檔或 `prompts.json`。金鑰只在執行當下由使用者以環境變數傳入(如 `GKEY=... node ...`),用完不留存。**若金鑰不慎被貼進對話、指令或日誌,即視為已洩漏——完成後立即到供應商後台撤銷/輪替該金鑰。**

## 素材路徑選擇(先選路徑)

| 需求 | 路徑 | 工具 | 背景 / 去背 |
|---|---|---|---|
| **單一物件**(每卡 1 件、透明浮貼) | 單物件去背 | `gen_assets.js` | 洋紅底 → `chroma_key.js` 去背 |
| **一整組呼應文字的場景**(多元件、玻璃/科技風) | 場景式(進階) | `gen_scene.js`(參考圖鎖風格) | 不透明霧面 + 洋紅底 → 去背浮貼(見「場景式素材」) |
| **需真半透明玻璃** | OpenAI 真透明 | `gen_assets.js`(`PROVIDER=openai`) | `background=transparent`(真 alpha) |

**原則:素材一律去背成透明 PNG。** 選定路徑後,單物件走下方決策流程,場景式走「場景式素材」節。

## 決策流程(依序詢問,不可跳步)

```
選到第 3 級 (或要求擬真素材)
  │
  ├─ Q1 有素材來源嗎?
  │    ├─ 有:本地素材目錄  → 指定路徑(建議 ./geo-assets/,命名 P編號_英文名.png)→ 驗收 → 嵌入
  │    ├─ 有:對話上傳去背 PNG → 存入素材目錄 → 驗收 → 嵌入
  │    └─ 沒有 → Q2
  │
  ├─ Q2 是否用 AI 產圖?
  │    ├─ 否 → 退回 1–3 級,或以 SVG 現繪「四件套插圖」補位(style-spec §5 fallback)
  │    └─ 是 → Q3
  │
  ├─ Q3 選供應商(預設 Gemini)
  │    ├─ Gemini(Nano Banana,預設)
  │    └─ OpenAI(gpt-image-1)
  │
  ├─ 確認環境(見下「環境檢查」)
  │    └─ 不 OK → 引導安裝/設定 → 再次確認 → OK 才往下
  │
  ├─ 產出流程(見下「產出流程」)
  │    ├─ 開元素需求單(項目 ↔ prompt)
  │    ├─ 呼叫 API 產圖(重試退避)
  │    ├─ 去背(Gemini 走洋紅 chroma-key;OpenAI 直接透明)
  │    ├─ 儲存素材 PNG + 儲存所用 prompt(prompts.json)
  │    └─ 驗收(邊緣無毛邊、無殘背、無文字)
  │
  └─ 以 <image> 嵌入 SVG(素材自帶光影,不疊 SVG 投影與地面橢圓)
```

## 環境檢查

繪製轉檔與去背都需要 Node + Playwright/Chromium;產圖需對應金鑰。逐項確認,缺哪補哪,**全部 OK 才進產出**。

1. **Node**:`node -v`(需 v18+)。
2. **Playwright + Chromium**(render.js 與 chroma_key.js 用):
   - 檢查:`NODE_PATH=$(npm root -g) node -e "require('playwright')"`
   - 缺:`npm install -g playwright` 然後 `NODE_PATH=$(npm root -g) npx playwright install chromium`
   - 驗證:`NODE_PATH=$(npm root -g) node -e "require('playwright').chromium.launch().then(b=>{console.log('ok');b.close()})"`
3. **金鑰(從環境變數,勿寫檔)**:
   - **Gemini**:`GEMINI_API_KEY`。
     - 驗證金鑰:`GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY`(200 即有效)。
     - **影像生成需開通 billing**:免費層影像配額 = 0(`generate_content_free_tier_requests, limit: 0`);文字模型免費、影像不免費。若回 429 且 `limit: 0`,請使用者到對應 Google Cloud 專案綁定帳單後再試。
     - 本機 `gemini` CLI 個人免費層登入已被封鎖(`UNSUPPORTED_CLIENT`),**不要走 CLI**,一律走 REST API。
   - **OpenAI**:`OPENAI_API_KEY`。
     - 驗證金鑰:`GET https://api.openai.com/v1/models`(帶 `Authorization: Bearer $KEY`)。
     - `gpt-image-1` 需帳號通過組織驗證(verification);若回 403 需使用者於 OpenAI 後台完成驗證。

## 產出流程

### 1. 開元素需求單
每張卡對應「一個主題物件」,列出 `{id, name, prompt}`。可參照 `scripts/asset_prompts.json` 的 20 組常用 prompt;缺的自行撰寫,一律遵守下方 prompt 規範。

### 2. Prompt 規範(產去背單物件用)
- 內容:`Professional 3D render of <單一主題物件>, <材質與色系>, ` + 固定尾句。
- **材質務必指定「不透明實心」**:透明/磨砂/玻璃材質會把洋紅 chroma 背景**吃進物件變粉紅**(chroma-key 無法救,因粉紅已是物件本體色)。凡長條圖、看板、幾何體等,一律寫 `opaque matte/solid ... (NOT glass, NOT transparent), every surface fully opaque`。內建 `asset_prompts.json` 已將 frosted-glass 改為 opaque。**刻意透明**的物件(玻璃罐、掃描光錐等,如 P12/P20)chroma 去背必殘色 → 改走 **OpenAI 真透明**,或接受。
- 固定尾句:`premium corporate design, semi-realistic proportions, refined studio lighting from the upper left, fully isolated single object with no background elements, sharp clean edges, product-visualization quality. Strictly no text, no letters, no numbers, no logos, no watermarks.`
- 色系呼應該卡專色(如紫卡建物用 desaturated purple-blue glass)。
- 光源一律左上,全圖素材複雜度一致。

### 3. 呼叫 API

本 skill 提供兩支產圖腳本,擇一即可:

| 腳本 | 語言 | 供應商 | 去背 | 適用 |
|---|---|---|---|---|
| `scripts/gen_assets.js`(**預設**) | Node | Gemini + OpenAI | Gemini 需接 `chroma_key.js`;OpenAI 直接透明 | 雙供應商、與 render/chroma 同為 Node 生態,環境一致 |
| `scripts/generate_assets.py` ⚠️**deprecated** | Python | 僅 OpenAI | 免去背(內建 alpha 裁切) | 功能為 js 版子集,**優先用 js**;僅需純 Python 環境時保留 |

兩者讀同一份 `scripts/asset_prompts.json`,輸出命名一致(`P編號_英文名.png`),可互換。**預設走 Node 版**;僅在指定用 Python/OpenAI 一鍵批次時才用 `generate_assets.py`(`python scripts/generate_assets.py --only P01,P15`)。

**Node 版用法**:
- 統一入口:`PROVIDER=gemini|openai GKEY=$KEY node scripts/gen_assets.js <manifest.json> <輸出目錄>`
  - `GKEY` 讀環境變數傳入(Gemini 讀 GKEY/GEMINI_API_KEY;OpenAI 讀 OKEY/OPENAI_API_KEY)。
- **重試退避**:遇 503(high demand)/429 自動重試(6 次、8s 起、每次 +4s)。**重試會逐次加強「禁止任何文字」語氣**(降低生成模型漏字機率);仍屬盡力而為,文字有無仍以人工驗收為準。任一素材最終失敗時腳本回**非零結束碼**,供上游流程判斷。
- **尾句模板**:manifest 的 prompt 若省略固定尾句,`gen_assets.js`/`generate_assets.py` 會**自動補上**(已含者不重複),故新增 prompt 只需寫「主題物件 + 材質色系」即可。
- **透明背景處理**:
  - **Gemini**:模型不給真 alpha(會畫棋盤格或實心底)。prompt 追加「置於純洋紅 `#FF00FF` chroma-key 平面背景、物件不透明、不要畫棋盤格」→ 產出後跑 `scripts/chroma_key.js` 去背。**白色/淺色物件**(如政府建物)用嚴格門檻,避免誤蝕。
  - **OpenAI**:`gpt-image-1` 支援 `background:"transparent"`,直接輸出 PNG alpha,通常免去背(仍需驗收)。
- 每呼叫一次,`gen_assets.js` 會把該素材**所用的 prompt 一併寫入輸出目錄的 `prompts.json`**(含 provider、model、timestamp),供日後重現與稽核。

### 4. 去背(通用純色 chroma-key,不限洋紅)
`NODE_PATH=$(npm root -g) node scripts/chroma_key.js <素材目錄> [檔名...] [--bg=#FF00FF] [--tol=70] [--loose] [--pad=8] [--alpha=20]`
- **通用化**:不再寫死洋紅——`--bg=#hex` 指定要挖的背景色;**省略則自動偵測四角背景色**。以顏色距離(`--tol`,預設 70)判定 + 邊緣羽化 + 自動裁切到不透明邊界。綠幕、白底、任意純色底皆可。
- **原則:產製的素材一律去背成透明 PNG**(除非走 OpenAI 真透明)。物件須**不透明**才能乾淨去背;半透明玻璃請改「不透明霧面」(見「場景式素材」)。
- **淺色物件邊緣被裁**時調 `--alpha`(裁切保留門檻,預設 20;白色物件降到 8–12 保住淡邊);`--pad` 調外擴;`--tol` 調挖除範圍(殘背調高、誤蝕調低)。失敗回非零結束碼。

### 5. 驗收與嵌入
- 驗收:邊緣無毛邊、無殘留背景色、物件完整未被誤蝕;**無亂碼文字**(簡短專案術語如 `AI`/`KPI`/`GIS` 可保留,但須拼字完全正確,拼錯即重產;承載資訊的文字仍由 SVG,見 style-spec §5)。若要術語出現,設環境變數 **`ALLOW_TERMS=1`**(泛指短代號)或 **`ALLOW_TERMS=AI,KPI`**(指定清單)——`gen_assets.js`/`generate_assets.py` 會自動移除尾句的 `no text` 限制並放行該短詞(承載資訊文字仍禁)。
- 嵌入:`<image href="data:image/png;base64,...">`(可攜)或相對路徑;**素材已自帶柔和光影,嵌入時不再疊 SVG 物件投影 `obj` 與地面扁橢圓**;依卡片比例 `preserveAspectRatio` 縮放。

## 場景式素材(圖文呼應,進階)

當卡片需要「**一整組會呼應文字的場景**」而非單一物件(如發展藍圖每卡),改走此路徑——效果比單物件強一個檔次:

- **工具**:`scripts/gen_scene.js`(多模態:**風格參考圖 + 文字 prompt** 一起送 Gemini)。用法:`GKEY=$KEY node scripts/gen_scene.js <參考圖> <prompt檔|字串> <輸出.png>`。
- **鎖風格**:提供一張**風格參考圖**(既有同風格素材/截圖),prompt 明講「**只取其視覺風格**(材質、光效、等角、發光),重新畫新內容」。
- **元件呼應內容**:場景由**多個元件**組成,每個元件對應該卡的一個文字重點(例:儀表板卡=長條圖+趨勢+圓餅+看板+AI 警示);元件清單直接從原始資料/RFP 長出來。
- **材質改「不透明霧面」才能去背(關鍵)**:場景**一律去背**成透明 PNG 才能浮貼(卡片漸層從空隙透出)。但**真半透明玻璃無法乾淨去背**(背景色透進物件變粉)——故 prompt 材質改 **`matte OPAQUE frosted (looks like glass but fully opaque, NOT see-through)`**:外觀仍是玻璃霧面、實際不透明,即可用 chroma-key 乾淨挖背。
- **去背流程**:生成在**純洋紅 `#FF00FF` 平背景**(prompt 明講「忽略參考圖背景、務必純洋紅、非白」)→ `scripts/chroma_key.js`(自動偵測四角背景色,不限洋紅)→ 透明 PNG。若模型畫成白底,重產並強化背景指令。
- **浮貼嵌入**:透明場景以 `<image preserveAspectRatio="xMidYMid meet">` 放在卡片內文下方,**不裁切、不墊底色**,卡片漸層自然透出 → 真正浮貼(見 `gen_blueprint.js` / `gen_blueprint2.js`)。
- **換色**:配合卡色,於 prompt 指定色系(如 `opaque TEAL frosted with aqua glow`);參考圖為藍時,色彩描述需夠強才蓋過。
- **文字**:場景可留簡短術語(§驗收),承載資訊文字仍由 SVG。

> **真透明玻璃**(要保留半透明感)只有一條乾淨路:**OpenAI `background=transparent`**(真 alpha)。Gemini 洋紅去背一律走「不透明霧面」。
> 對應版型:平行卡見 `scripts/gen_blueprint.js`、階梯成長見 `scripts/gen_blueprint2.js`。

## 產出物與留存
- 素材 PNG:存於素材目錄(建議專案 `./geo-assets/`),命名 `P編號_英文名.png`。
- **所用 prompt**:`prompts.json`(與素材同目錄),每筆含 `id / name / provider / model / prompt`(不含金鑰)。
- 這兩者留存在**使用者專案目錄**,不放進 skill 套件內。
