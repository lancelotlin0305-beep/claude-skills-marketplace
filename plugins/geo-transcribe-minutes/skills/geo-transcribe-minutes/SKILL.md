---
name: geo-transcribe-minutes
description: >-
  把音檔/影音檔/YouTube 連結高效率轉成逐字稿,順稿後萃取會議重點或影片/技術重點,
  整理成會議記錄或技術傳承文件(逐字稿 MD、重點 MD、內嵌 SVG 的單檔 HTML,可選 SRT 字幕)。
  多引擎自動偵測:Gemini/Groq/ElevenLabs/OpenAI 雲端 API 或本地
  faster-whisper/SenseVoice(CPU 可用、機密資料不出機器);中文一律輸出繁體台灣用語
  (OpenCC s2twp)。使用時機:使用者提供錄音檔、影片檔或 YouTube 連結,說「轉逐字稿」
  「聽打」「整理會議記錄」「會議重點」「影片重點」「摘要這段錄音」「技術傳承/交接文件」;
  既有逐字稿/SRT 只在順稿、壓字幕、影片重點、技術傳承用途時適用——**文字逐字稿要整理
  會議記錄請改用 geo-meeting-minutes-builder**;或要求把先前產出的成品迭代更新。
---

<!-- skill 20260818.05 -->
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

## 產出(輸出資料夾 `<來源檔名>_minutes\`)

| 檔案 | 內容 |
|---|---|
| `transcript_raw.txt` | 原始逐字稿(引擎輸出+時間戳,存證不修改) |
| `transcript.md` | 順稿版逐字稿(分段、發言者、修錯字去贅詞) |
| `minutes.json` | 會議模式的結構化中繼檔(決議/行動項/風險…,嚴格 schema) |
| `summary.md` | 會議重點/技術重點/影片重點(依模式) |
| `minutes.html` / `handover.html` | 最終文件:單檔自足 HTML,內嵌 SVG 時間軸等 |
| `subtitles.srt` | 字幕(轉錄時自動產;Gemini 引擎時間戳僅分:秒級,不宜壓字幕) |

交付時附「待確認清單」([?] 標記、[聽不清]、推斷的與會者身分)。

## 與其他 skill 銜接

- **深度會議記錄轉交 `geo-meeting-minutes-builder`**:使用者需要對外/內部會議章節結構、
  跨會議追蹤(前次待辦進度回顧、ID 連號)、知識萃取 HTML(五類卡片)、或只有手寫摘要
  沒有錄音(模式 B)時 —— 本 skill **只做轉錄,簡轉繁完成即交棒;順稿與萃取不做**
  (由對方依其 transcript-cleanup 規則執行,避免二次加工污染「原話」依據)。
  交接物:`segments.json`、`transcript_raw.txt`、術語表、會議基本資料(日期/出席者名單)、
  引擎名(含時間戳精度註記,Gemini 為分:秒級近似值)、輸出資料夾。
  本 skill 的會議模式適合「單場、快速、要 HTML 成品」的情境。
- 講者導向的**卡片化知識庫**(五類分類、跨會議累積、限閱管理)→ 同上轉交;
  本 skill 的技術傳承(handover)模式是**單場敘事型**交接文件(SOP/眉角/Q&A 一頁 HTML)。
- 技術傳承文件的正式架構圖/流程圖:詢問後呼叫 `geo-infographic-style` 或
  `geo-bpmn-flow-builder` 產 SVG 嵌入。
- 會議記錄中談到的跨部門流程要畫泳道圖:交給 `geo-bpmn-flow-builder`。
- 多場會議累積追蹤**預設轉交 `geo-meeting-minutes-builder` 模式 C**(待辦 ID 連號、
  進度回顧);僅使用者明確要「事後自由追問/產 podcast/不花 API 費」時才提 NotebookLM
  管線(engines.md「NotebookLM 路線」節,非官方 API 有風險,須主動告知)。
