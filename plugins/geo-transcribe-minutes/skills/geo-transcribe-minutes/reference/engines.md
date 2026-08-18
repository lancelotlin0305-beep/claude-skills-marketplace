# 轉錄引擎選擇指南(2026-08 研究結果)

`scripts/transcribe.py --engine auto` 會依 API key 自動選;本文件供**跟使用者討論方案**、
**排除安裝問題**、**估成本**時查閱。價格會變動,重大決策前以官方 console 為準。

## 決策速查

| 情境 | 建議 |
|---|---|
| 有 GEMINI_API_KEY,要說話者標記+重點一次到位 | **gemini**(3.7-flash/2.5-flash) |
| 有 GROQ_API_KEY,要快要便宜 | **groq**(whisper-large-v3-turbo,1 小時音訊約 15 秒轉完) |
| 要最準的逐字稿+字級時間戳+說話者 | **elevenlabs**(Scribe) |
| 錄音不能出機器(機密)、無 GPU | **local**:SenseVoiceSmall(`scripts/sensevoice_transcribe.py`,實測 14.6×);字幕要毫秒精度才用 faster-whisper |
| 錄音不能出機器、有 NVIDIA GPU(8GB+) | **local**:faster-whisper + Breeze-ASR-25 |
| 台灣國語+中英夾雜嚴重、品質優先 | **Breeze-ASR-25**(聯發科,原生繁體)本地跑,或 gemini |
| YouTube 影片 | 公開影片直接把 URL 餵 Gemini(免下載);否則 yt-dlp,見下 |

## 雲端引擎

### Gemini(唯一「轉寫+說話者+會議重點」單次呼叫完成的方案)
- **模型現況(2026-08-18 實測)**:transcribe.py 降級鏈 `gemini-3.7-flash → 3.6-flash
  → 3.5-flash`;**`gemini-2.5-flash` 已對新用戶關閉(404)勿再用**;3.7-flash 高峰時段
  常見 503,腳本會自動退避重試(20s/40s)再降級。
- 音訊:單 prompt 最長 9.5 小時;1 分鐘=1,920 tokens;支援 WAV/MP3/AAC/OGG/FLAC。
- 成本約 **$0.18/小時**(Flash 系,含摘要 output);有免費層(RPD 低,以 AI Studio 儀表板為準)。
- 影片:可直接吃影片檔(含畫面理解,~263 tokens/秒,較貴)或**公開 YouTube URL**(preview、目前免費)。只要逐字稿就先抽音軌再丟,便宜 8 倍。
- 限制:時間戳是模型生成的 MM:SS 級,適合會議記錄引用、**不適合壓字幕**;diarization 靠 prompt 指定。
- key:https://aistudio.google.com → `GEMINI_API_KEY`。

### Groq(最省最快)
- whisper-large-v3-turbo,**$0.04/小時**,217× 即時速度;免費層每天 28,800 音訊秒(約 8 小時)。
- OpenAI 相容 API;verbose_json 有 segment 時間戳(可轉 SRT);**無 diarization**;單檔 25MB 上限(transcribe.py 自動切段)。
- key:https://console.groq.com → `GROQ_API_KEY`。

### ElevenLabs Scribe(品質+diarization 標竿)
- scribe_v2 batch **$0.22/小時**;99 語言、官方宣稱 Mandarin WER 業界最低;內建 32 人 diarization 不加價;word-level 時間戳。
- key:https://elevenlabs.io → `ELEVENLABS_API_KEY`(transcribe.py 會先試 scribe_v2、失敗退 scribe_v1)。

### OpenAI(備援)
- whisper-1 $0.36/小時、支援 SRT/VTT;gpt-4o-transcribe 無時間戳輸出,不建議用於本流程。

### 其他已查證事實
- **Claude API 不支援音訊輸入**(2026-08 仍然),所以順稿/摘要由 Claude 做、轉寫交給上述引擎。
- AssemblyAI Universal-2 $0.15/hr、Deepgram Nova-3 ~$0.26/hr 也可用,但功能與上述重疊,未內建於 transcribe.py。

## 本地引擎(離線/機密資料)

### faster-whisper(v1.2.x,Python 方案主力)
```powershell
pip install faster-whisper                     # CPU 可直接用(int8)
# GPU 另需:pip install nvidia-cublas-cu12 nvidia-cudnn-cu12==9.*
#   (DLL 找不到時把 site-packages\nvidia\{cudnn,cublas}\bin 加入 PATH;
#    只有 cuDNN8 的環境退回 ctranslate2==4.4.0)
```
- **Python 版本坑**:預編譯 wheel 支援 3.10–3.12 最穩;3.13+ 裝不起來就
  `uv venv --python 3.12` 另建環境。
- 模型選擇:`large-v3-turbo`(速度甜蜜點)/ `large-v3`(中文略準)/
  **`SoybeanMilk/faster-whisper-Breeze-ASR-25`**(聯發科台灣國語微調,中英夾雜 CER 低 56%、
  原生輸出繁體台灣用語,免 OpenCC;體積為 large-v2 級,CPU 上慢,GPU 建議)。
- 長檔必開 `vad_filter=True`(內建 Silero VAD,防中文重複幻覺);GPU 上可用
  `BatchedInferencePipeline` 再快 3–4 倍。transcribe.py 的 local 引擎已含 VAD 與繁體誘導 prompt。

### SenseVoiceSmall(CPU-only 神器)
- 非自回歸 234M 模型,**CPU 上約 17× 即時**(比 whisper CPU 快一個數量級),中文 CER 顯著低於 whisper;輸出**簡體**、無字級時間戳。
- **實測(2026-08-18,49 分鐘遠場會議室錄音)**:`scripts/sensevoice_transcribe.py`
  (VAD 分段→逐段辨識→segments.json/srt,含 s2twp)實跑 **14.6× 即時**(203 秒),
  對比 faster-whisper turbo CPU 約 40 分鐘。品質:遠場多人交談場景與 whisper 同級
  (HTML→HTL 之類錯字、偶混情緒表符),**均明顯低於 Gemini**——機密場景用本地引擎
  時,順稿要有較多人工校對的預期;近場單人錄音才可期待 benchmark 等級表現。
- **Windows 眉角**:funasr `hub="hf"` 下載需設 `HF_HUB_DISABLE_SYMLINKS=1`
  (否則 WinError 1314 symlink 權限直接失敗);ModelScope 預設源在台灣常僅 ~1.6MB/s,
  HF 源較快。torch 2.13+cpu/funasr 1.4.2 於 Python 3.14 實測可用。
```powershell
pip install funasr torch torchaudio opencc-python-reimplemented
```
```python
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
m = AutoModel(model="iic/SenseVoiceSmall", vad_model="fsmn-vad",
              vad_kwargs={"max_single_segment_time": 30000}, device="cpu")
res = m.generate(input="audio.wav", language="zh", use_itn=True,
                 batch_size_s=300, merge_vad=True)
text = rich_transcription_postprocess(res[0]["text"])  # 再過 OpenCC s2twp
```
- 需要**說話者分離+標點+句級時間戳**一次到位(免 HF token):FunASR Paraformer 管線
  `AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", spk_model="cam++")`,
  結果在 `res[0]["sentence_info"]`(text/start/end/spk)。
- 這些 funasr 路線未包進 transcribe.py(依賴重),需要時現場照上面片段寫小腳本,輸出轉成
  segments.json 同格式即可接回流程。

### 說話者分離(本地)
- 首選 FunASR `cam++`(上面一行,免 token)。
- WhisperX 3.8.x + pyannote **community-1**:字級時間戳最準,但需 HF token 且要在 HF 網頁
  同意 `pyannote/speaker-diarization-community-1` 條款——**只同意舊 3.1 不會報錯、speaker 全空**。
- sherpa-onnx 離線 diarization:免 token、免 PyTorch、CPU 可跑,備選。

### 明確不推薦
insanely-fast-whisper(停更、flash-attn Windows 難裝)、NVIDIA Parakeet/Canary 與 Kyutai(無中文)、NeMo/vLLM 原生 Windows 路線(要用得走 WSL2)。

## 線上影片來源(yt-dlp,2026 現況)

YouTube 已部署 PO Token+SABR,裸跑常 403。可行做法(住宅網路成功率高):
```powershell
winget install yt-dlp.yt-dlp
# 1) 先試零成本:抓 YouTube 自動字幕(品質普通,交給 Claude 重整仍很能用)
yt-dlp --write-auto-sub --sub-lang "zh-TW,zh-Hant,zh,en" --skip-download --convert-subs srt "URL"
# 2) 抽音軌(必要時加 --cookies-from-browser firefox / chrome)
yt-dlp -x --audio-format m4a "URL"
```
公開 YouTube 影片的**最省事路徑是直接把 URL 給 Gemini**(generateContent 的 file_data.file_uri 填 YouTube URL),完全跳過下載;transcribe.py 未內建此路徑,需要時由 Claude 以 curl/Python 直接呼叫。

## NotebookLM 路線(跨會議知識庫)

使用者機器上另有一條現成管線:`D:\01.專案\AI研討\NOTEBOOKLM\meeting-pipeline\new-minutes.ps1`
——上傳錄音給 NotebookLM(它自己轉錄)→ 嚴格 JSON 萃取 → PowerShell 確定性套版出 HTML。

```powershell
.\new-minutes.ps1 -File "錄音.m4a" -Title "第14次週會" [-Notebook <既有id>]
```

**何時建議走這條**:使用者想把多場會議**累積進同一個 notebook 當知識庫**
(事後跨會議追問「這個決定當初為什麼這樣定?」、產 podcast 音檔),或想完全不花
API 費用/token。

**風險(主動告知)**:notebooklm-py 是**非官方 API**,Google 改端點就壞、
Google 登入憑證落地在 `~\.notebooklm\`、免費層有配額——適合個人用途,
不要放進有 deadline 的正式流程。正式/穩定需求走本 skill 的官方引擎。
兩條路線的萃取 schema 已對齊(本 skill 的 minutes.json 即源自該管線並擴充時間戳),
產出可互換。另外環境裡也裝有 `notebooklm` skill 可直接操作 NotebookLM。

## 簡繁轉換
`pip install opencc-python-reimplemented`;用 `s2twp`(簡→台灣繁體+台灣詞彙:软件→軟體、視頻→影片)。s2twp 偶有過度轉換(人名/專名),重要文件抽查;只轉字形用 `s2tw`。transcribe.py 已自動套用(未安裝時在 segments.json 標 `needs_zh_conversion=true`,由 Claude 順稿時轉)。

## 一小時會議錄音成本對照(2026-08)

| 方案 | 轉寫 | 含摘要合計 |
|---|---|---|
| Groq + Claude 摘要 | $0.04(免費層內 $0) | ~$0.05–0.19 |
| Gemini Flash 一次搞定 | — | ~$0.18(Batch 半價) |
| ElevenLabs + Claude 摘要 | $0.22 | ~$0.27–0.37 |
| OpenAI whisper-1 + 摘要 | $0.36 | ~$0.41–0.51 |
| 本地(faster-whisper/SenseVoice) | $0 | $0(時間成本:CPU 約 0.5–17× 即時視模型) |
