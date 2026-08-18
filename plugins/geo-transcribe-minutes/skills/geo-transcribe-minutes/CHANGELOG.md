# CHANGELOG — geo-transcribe-minutes

## 20260818.05(三引擎同場實測:SenseVoice 落地)
- 新增 `scripts/sensevoice_transcribe.py`:fsmn-vad 分段 → SenseVoiceSmall 逐段辨識
  → segments.json/transcript_raw.txt/subtitles.srt(含 OpenCC s2twp)。
  同場 49 分鐘會議實測 **14.6× 即時**(203s,對比 faster-whisper turbo CPU 40 分鐘)。
- engines.md 記入實戰情報:遠場多人會議上本地引擎(SenseVoice/whisper)品質同級且
  均低於 Gemini;Windows 需 `HF_HUB_DISABLE_SYMLINKS=1`(funasr hub="hf" 否則
  WinError 1314);torch 2.13+cpu/funasr 1.4.2 於 Python 3.14 可用;CPU 機密場景
  首選改 SenseVoice,毫秒級字幕才用 faster-whisper。

## 20260818.04(首次端到端實測修正:49 分鐘真實會議錄影全程走通)
- transcribe.py Gemini 引擎兩項實戰修正:
  - **暫時性錯誤退避重試**:503/429/5xx 先重試(20s/40s)再降級,原本只認 404
    直接炸掉(3.7-flash 高峰時段 503 實測觸發)。
  - **降級鏈更新**:`gemini-3.7-flash → 3.6-flash → 3.5-flash`;原 fallback
    `gemini-2.5-flash` 已對新用戶關閉(404 實測),engines.md 同步註記。
- 實測結果:173MB MP4 → ffmpeg 抽音軌 → gemini-3.6-flash 轉錄 608 段(繁中+
  說話者標記)→ 順稿 → 技術重點 → handover.html,全程通過。

## 20260818.03(乾淨 session 架構審查後的分工收斂)
- **讓出文字入口**:description 明訂既有逐字稿/SRT 僅限順稿、壓字幕、影片重點、技術傳承;
  文字逐字稿要整理會議記錄一律 geo-meeting-minutes-builder。刪除與 description 重複的
  「何時啟動」節。
- **正式交接介面**:轉交路徑只做轉錄(跳過順稿與萃取,避免二次加工污染對方「引用原話」
  依據);交接物明訂為 segments.json、transcript_raw.txt、術語表、會議基本資料、
  引擎名(含時間戳精度)、輸出資料夾;確定轉交時同則索取出席者名單與會議日期。
- **修正矛盾**:transcript_raw.txt 統一為「引擎原樣不動」;開場確認補問會議日期
  (相對期限換算基準);多場會議累積預設轉交 builder 模式 C,NotebookLM 降為明確
  要求時才提。
- **對齊與簡化**:標記 `(?)` 全面改 `[?]`(與 builder 同系);萃取六規則擴為七規則
  (補「疑義往未決降級」與「反轉檢查」);品質門檻合併為 workflow 唯一檢核清單
  (polish §C 縮為引用);html-doc-spec 命名節縮為引用 SKILL.md 產出表。

## 20260818.02
- 銜接新移植的 `geo-meeting-minutes-builder`:深度會議記錄(對外/內部結構、跨會議追蹤、
  知識萃取 HTML、模式 B)由本 skill 轉錄+順稿後轉交;本 skill 的會議模式定位為
  「單場、快速、要 HTML 成品」。SKILL.md 銜接節與 workflow.md 開場確認同步更新。

## 20260818.01
- 合併使用者既有 NotebookLM 會議管線(D:\01.專案\AI研討\NOTEBOOKLM\meeting-pipeline)的精華:
  - 會議模式改**兩段式**:先萃取嚴格 schema 的 `minutes.json`(移植 extract-minutes.txt
    防幻覺六規則:null 不猜測、due_raw 留原文、實際拍板才算決議、is_blocker…,
    並擴充 ts 時間戳欄位),summary.md 與 HTML 均由 JSON 取值,三份文件不漂移。
  - `templates/meeting.html` 全面改版為編輯級文件風(源自 build-minutes.ps1 設計):
    深淺色雙主題、決議摘要表 D01…、行動項卡關紅標、風險/未解/延後卡片網格、
    空值鐵則;保留議程時間軸 SVG 與逐字稿附錄。handover.html 維持淺色卡片風。
  - `engines.md` 新增「NotebookLM 路線」節:跨會議知識庫情境的替代管線與風險告知
    (非官方 API、憑證落地、配額);workflow/SKILL 同步銜接。

## 20260817.01
- 首版。深度研究 2025–2026 轉錄方案後建立:
  - 多引擎轉錄(`scripts/transcribe.py`):Gemini / Groq / ElevenLabs / OpenAI / 本地 faster-whisper,依 API key 與環境自動偵測。
  - 環境檢查(`scripts/check_env.py`):ffmpeg、Python 套件、API key、GPU 一次盤點並給安裝指令。
  - 順稿與重點萃取規則(`reference/polish-and-summary.md`):同音錯字、贅詞、簡轉繁 s2twp、術語表;會議/技術傳承/影片三種萃取模式。
  - 產出規範(`reference/html-doc-spec.md`)與兩份 HTML 模板(會議記錄 `templates/meeting.html`、技術傳承 `templates/handover.html`),單檔自足、內嵌 SVG、可列印。
  - 端到端流程(`reference/workflow.md`)與引擎選擇細節(`reference/engines.md`)。
