# 端到端工作流程

## 0. 開場確認(一次問完,已明確的不問)

用一則 AskUserQuestion(至多 3 題)確認:

1. **模式**:會議記錄(meeting)/技術傳承(handover)/影片重點(video)。
   從輸入通常可推斷(如檔名含「會議」、使用者說「交接」),能推斷就不問。
   會議記錄需求含「對外/內部結構、跨會議追蹤、知識萃取」時走**轉交分支**:本 skill
   只做轉錄(**跳過第 3–5 步**),依 SKILL.md 銜接節的交接物清單交棒
   `geo-meeting-minutes-builder`;確定轉交時,同一則詢問順帶索取出席者名單與會議日期
   ——模式選項中一併呈現。
2. **引擎**:先跑 `python scripts/check_env.py` 盤點,把「建議引擎+成本+隱私差異」
   擺進選項讓使用者選(機密錄音必須主動提醒雲端引擎會上傳音檔)。
   只有一種引擎可用時不問,直接告知採用。
   使用者提到「多場會議累積追蹤」時預設轉交 geo-meeting-minutes-builder 模式 C;
   明確要「事後自由追問/產 podcast/不花 API 費」才提 NotebookLM 管線
   (engines.md「NotebookLM 路線」節,含風險告知)。
3. **術語表與會議日期**:詢問是否提供與會者名單/產品名/專有名詞(可跳過);
   並確認會議日期(可從檔案時間推定後請使用者確認)——這是相對期限換算的基準。

輸出資料夾預設 `<來源檔名>_minutes\`(與來源檔同層);使用者有指定則從之。

## 1. 取得音檔

- 本地音檔/影片:直接進第 2 步(transcribe.py 會自動用 ffmpeg 抽音軌/壓縮)。
- YouTube/線上影片 URL:依 engines.md「線上影片來源」節——公開 YouTube 優先
  「URL 直餵 Gemini」或抓自動字幕,退而 yt-dlp 抽音軌。
- 使用者已有逐字稿(文字/SRT):跳過轉錄,把內容整理成 segments 格式後直接進第 3 步。

## 2. 轉錄

```powershell
python scripts/transcribe.py <輸入檔> --engine <選定> --keyterms "詞1,詞2" [--out DIR]
```

- 缺 ffmpeg 時先 `winget install Gyan.FFmpeg`(裝完需重開終端機才有 PATH)。
- Windows 上 `python` 若回 9009/找不到,改用 `py -3` 執行。
- 產出 `segments.json`、`transcript_raw.txt`、`subtitles.srt`。
- 引擎失敗時的降級順序:回報錯誤原因 → 換下一個可用引擎(auto 順序)→ 都不行就
  引導使用者取得 Groq 免費 key(engines.md)。
- 超過 2 小時的長檔:先向使用者確認成本/時間預估再跑。

## 3. 順稿(Claude 執行)

依 `polish-and-summary.md` §A:

- 讀 `segments.json`;`needs_zh_conversion=true` 時一併簡轉繁。
- **分段處理**(每批約 10–15 分鐘內容),產出 `transcript.md`(順稿版,含時間戳/發言者)。
- `transcript_raw.txt` 保留不動(原始存證)。
- 長逐字稿(>1.5 小時)可用 subagent 平行處理各段,最後合併統一術語。

## 4. 重點萃取(Claude 執行)

依 `polish-and-summary.md` §B 的對應模式:

- **會議模式**:先依萃取七規則產 `minutes.json`(嚴格 schema,null 不猜測),
  再由 JSON 轉寫 `summary.md`;之後 HTML 也只從 JSON 取值,三份文件不漂移。
- **技術傳承/影片模式**:直接產 `summary.md`。

每條重點/決議/步驟必須帶時間戳、可對回逐字稿;不得出現逐字稿沒有的內容。

## 5. HTML 文件

依 `html-doc-spec.md`,以 `templates/meeting.html` 或 `templates/handover.html` 為骨架
填入內容,產出 `<會議名或主題>_會議記錄.html` / `<會議名或傳承主題>_技術傳承.html`
(**檔名必含會議名稱或內容主題**,離開資料夾仍自明,見 SKILL.md 產出表):

- SVG 時間軸座標按總時長比例換算(spec 有公式);段數超限改清單。
- 技術傳承的架構圖:內容夠具體時,**主動詢問**是否呼叫 `geo-infographic-style` /
  `geo-bpmn-flow-builder` 產正式圖嵌入(不要不問就跑,那是另一段工作量)。
- video 模式:重點在 `summary.md`,HTML 用 meeting 模板改標題結構(章節=議題)即可。

## 6. 交付

- 逐檔列出產出物與用途;附「待確認清單」([?]、[聽不清]、推斷的身分)。
- 提醒:HTML 為單檔自足,可直接寄出或列印。
- 迭代:使用者修改 summary.md/指出錯字後,同步改 transcript.md 與 HTML,
  HTML 頁尾版號 vN+1 並列變更摘要。

## 品質門檻(唯一檢核清單,交付前逐條過)

1. 時間戳抽查 3 處,能對回 `transcript_raw.txt`。
2. 專有名詞三份文件(transcript.md / summary.md / HTML)拼法一致。
3. HTML 在無網路環境開啟正常(無外部資源)、SVG 無溢出。
4. 行動項目無編造的負責人/期限;摘要無逐字稿裡沒有的內容。
5. 反轉檢查:後段推翻前段的決議已反映(以最後拍板為準,來源列多時間戳)。
6. 交付說明附「待確認清單」:所有 `[?]`、`[聽不清]`、推斷的身分集中列出。
