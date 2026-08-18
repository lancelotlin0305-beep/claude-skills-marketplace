---
name: geo-transcribe-minutes
description: >-
  會議產出管線入口。輸入:影音檔/語音檔/YouTube 連結**或既有逐字稿(txt/md/srt)**,
  可另附參考資料(RFP、歷次會議記錄、術語表/與會者名單)強化專名校正與前次待辦回顧。
  會議模式輸出「標準交付組合」四件:順稿逐字稿 MD、重點摘要 MD、重點摘要 SVG HTML、
  公文體會議紀錄 DOCX;另支援技術傳承(handover)與影片重點模式。多引擎轉錄自動偵測
  (Gemini/Groq/ElevenLabs/OpenAI/本地 faster-whisper 與 SenseVoice,機密可離線),
  中文一律輸出繁體台灣用語。使用時機:使用者提供錄音、影片、YouTube 連結或逐字稿,
  說「轉逐字稿」「聽打」「整理會議記錄」「會議重點」「摘要這段錄音」「技術傳承文件」;
  需要知識萃取 HTML、對外/內部完整章節結構、嚴格跨會議追蹤時轉 geo-meeting-minutes-builder;
  或要求把先前產出的成品迭代更新。
---

<!-- skill 20260818.07 -->
<!-- 修改本 skill 時:同步更新上行版號(yyyymmdd.兩位數序號),並在 CHANGELOG.md 增列 -->

# 音檔/影音 → 逐字稿 → 會議記錄/技術傳承文件

**一律以繁體中文回覆與產出**(逐字稿、重點、HTML 皆同;英文術語保留原文)。

## 如何執行(細節見 reference,開工前先讀)

1. `reference/workflow.md`:六步流程——開場確認(模式/引擎/術語表,一則問完)→
   取得音檔 → 轉錄 → 順稿 → 重點萃取 → HTML 文件;含降級策略與品質門檻。
2. `reference/engines.md`:引擎決策表、安裝指令、成本對照(2026-08 研究)、
   yt-dlp 現況;跟使用者討論方案或排除安裝問題時查閱。
   **機密錄音必須主動提醒:雲端引擎會上傳音檔,可改本地引擎。**
3. `reference/polish-and-summary.md`:順稿七規則(簡轉繁 s2twp、同音錯字、去贅詞、
   時間戳保留…)與三種模式(會議/技術傳承/影片)的萃取結構。會議模式**兩段式**:
   先依萃取七規則產結構化 `minutes.json`(null 不猜測、實際拍板才算決議、疑義往未決降級、
   相對日期換算+due_raw 留原文),summary 與 HTML 都從 JSON 取值。品質底線:
   **摘要內容必須能對回逐字稿時間戳,不得編造**。
4. `reference/html-doc-spec.md` + `templates/meeting.html`、`templates/handover.html`:
   最終 HTML 規範(單檔自足、內嵌 SVG、可列印)——照模板填,不從零手刻。

## 工具

- `python scripts/check_env.py`:盤點 ffmpeg/API key/套件/GPU,回報建議引擎
  (`RECOMMEND=<engine>`)與缺件安裝指令。**每次開工先跑。**
- `python scripts/transcribe.py <檔> --engine auto|gemini|groq|elevenlabs|openai|local
  [--keyterms "…"] [--out DIR]`:統一轉錄 CLI(自動抽音軌/壓縮/切段/簡轉繁),
  產出 `segments.json`、`transcript_raw.txt`、`subtitles.srt`。
  雲端引擎零 pip 依賴,只需對應環境變數的 API key。

## 產出(輸出資料夾 `<來源檔名>_minutes\`;檔名必含會議名/主題,離開資料夾仍自明)

**會議模式=標準交付組合四件**(輸入不論影音/語音/逐字稿,交付一致):

| 檔案 | 內容 |
|---|---|
| `<會議名>_逐字稿.md` | 順稿版(分段、發言者、時間戳、議題索引);原始 `transcript_raw.txt` 併存存證 |
| `<會議名>_重點摘要.md` | 會議重點(結論/決議/行動項;有歷次會議記錄輸入時含「前次待辦進度回顧」) |
| `<會議名>_重點摘要.html` | SVG 視覺版單檔 HTML(議程時間軸/決議摘要表/行動項/發言佔比) |
| `YYYYMMDD_<會議名>_會議紀錄_正式版_v1.docx` | 公文體(呼叫 geo-meeting-minutes-builder 的 `build_official_minutes.py`,見 workflow §5b) |

中繼與其他模式:`minutes.json`(結構化中繼,嚴格 schema)、`subtitles.srt`(轉錄自動產;
Gemini 時間戳僅分:秒級不宜壓字幕);技術傳承模式產 `<主題>_技術傳承.html`+重點 MD,
影片模式產重點 MD(結構見 polish-and-summary §B2/B3)。

交付時附「待確認清單」([?] 標記、[聽不清]、推斷的與會者身分)。

## 與其他 skill 銜接

- **深度需求轉交 `geo-meeting-minutes-builder`**:知識萃取 HTML(五類卡片)、
  對外/內部完整章節結構(客戶疑問/待提供文件/承諾強度分級)、**嚴格**跨會議追蹤
  (待釐清懸置累計、逾期分析、差異對照表)、或只有手寫摘要沒有錄音(模式 B)時
  —— 本 skill **只做轉錄,簡轉繁完成即交棒;順稿與萃取不做**(由對方依其
  transcript-cleanup 規則執行,避免二次加工污染「原話」依據)。
  交接物:`segments.json`、`transcript_raw.txt`、術語表、會議基本資料(日期/出席者名單)、
  引擎名(含時間戳精度註記,Gemini 為分:秒級近似值)、輸出資料夾。
  本 skill 的會議模式=「標準交付組合」情境(含輕量版前次待辦回顧,見 workflow §4)。
- 講者導向的**卡片化知識庫**(五類分類、跨會議累積、限閱管理)→ 同上轉交;
  本 skill 的技術傳承(handover)模式是**單場敘事型**交接文件(SOP/眉角/Q&A 一頁 HTML)。
- 技術傳承文件的正式架構圖/流程圖:詢問後呼叫 `geo-infographic-style` 或
  `geo-bpmn-flow-builder` 產 SVG 嵌入。
- 會議記錄中談到的跨部門流程要畫泳道圖:交給 `geo-bpmn-flow-builder`。
- 多場會議累積追蹤**預設轉交 `geo-meeting-minutes-builder` 模式 C**(待辦 ID 連號、
  進度回顧);僅使用者明確要「事後自由追問/產 podcast/不花 API 費」時才提 NotebookLM
  管線(engines.md「NotebookLM 路線」節,非官方 API 有風險,須主動告知)。
