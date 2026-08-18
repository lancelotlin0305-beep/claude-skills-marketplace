# -*- coding: utf-8 -*-
"""統一轉錄 CLI:音檔/影片 → segments.json + transcript_raw.txt + subtitles.srt

用法:
  python transcribe.py <輸入檔> [--engine auto|gemini|groq|elevenlabs|openai|local]
                       [--lang zh] [--out DIR] [--model NAME] [--keyterms "詞1,詞2"]
                       [--no-diarize] [--chunk-sec 1500]

引擎自動偵測順序(--engine auto):
  GEMINI_API_KEY/GOOGLE_API_KEY → gemini(轉寫+說話者,時間戳為分:秒級)
  GROQ_API_KEY                  → groq whisper-large-v3-turbo(快又便宜,無說話者)
  ELEVENLABS_API_KEY            → elevenlabs scribe(字級時間戳+說話者)
  OPENAI_API_KEY                → openai whisper-1
  (無任何 key)                  → local faster-whisper(需 pip install faster-whisper)

輸出(--out 目錄,預設 <輸入檔名>_minutes):
  segments.json      統一格式 {engine, language, duration_sec, needs_zh_conversion,
                                segments: [{start, end, speaker|null, text}]}
  transcript_raw.txt 依 segments 串成純文字(含 [hh:mm:ss] 與 speaker)
  subtitles.srt      SRT 字幕

雲端引擎只用 Python 標準庫;簡繁轉換自動嘗試 opencc(沒裝則在 JSON 標
needs_zh_conversion=true,由呼叫端(Claude)自行轉換)。
"""
import argparse
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows 主控台中文
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff"}
VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".wmv", ".ts", ".m4v", ".flv"}


def die(msg):
    print(f"[錯誤] {msg}", file=sys.stderr)
    sys.exit(1)


def info(msg):
    print(f"[transcribe] {msg}", flush=True)


# ---------------------------------------------------------------- ffmpeg
def ffmpeg_path():
    return shutil.which("ffmpeg")


def ffprobe_duration(path):
    exe = shutil.which("ffprobe")
    if not exe:
        return None
    try:
        out = subprocess.run(
            [exe, "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=60)
        return float(out.stdout.strip())
    except Exception:
        return None


def prepare_audio(src, workdir):
    """影片抽音軌/重壓音訊為 16kHz 單聲道 32kbps MP3(1 小時約 14MB)。"""
    src = Path(src)
    if not ffmpeg_path():
        if src.suffix.lower() in AUDIO_EXTS:
            info("找不到 ffmpeg,直接使用原始音檔(可能過大或格式不受支援)。"
                 "建議安裝: winget install Gyan.FFmpeg")
            return src
        die("輸入是影片但找不到 ffmpeg,無法抽音軌。請先安裝: winget install Gyan.FFmpeg")
    out = Path(workdir) / (src.stem + "_16k.mp3")
    info(f"ffmpeg 轉出 16kHz 單聲道 MP3 → {out.name}")
    r = subprocess.run(
        [ffmpeg_path(), "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000",
         "-b:a", "32k", str(out)],
        capture_output=True, text=True)
    if r.returncode != 0:
        die(f"ffmpeg 轉檔失敗:\n{r.stderr[-800:]}")
    return out


def chunk_audio(path, chunk_sec, workdir):
    """超長音檔切段(無重疊),回傳 [(offset_sec, chunk_path), ...]。"""
    dur = ffprobe_duration(path) or 0
    if dur <= chunk_sec + 60:
        return [(0.0, Path(path))]
    pattern = Path(workdir) / (Path(path).stem + "_part%03d.mp3")
    r = subprocess.run(
        [ffmpeg_path(), "-y", "-i", str(path), "-f", "segment",
         "-segment_time", str(chunk_sec), "-c", "copy", str(pattern)],
        capture_output=True, text=True)
    if r.returncode != 0:
        die(f"ffmpeg 切段失敗:\n{r.stderr[-800:]}")
    parts = sorted(Path(workdir).glob(Path(path).stem + "_part*.mp3"))
    info(f"音檔 {dur/60:.0f} 分鐘,切成 {len(parts)} 段(每段 {chunk_sec}s)")
    return [(i * chunk_sec, p) for i, p in enumerate(parts)]


# ---------------------------------------------------------------- HTTP 工具
def http_json(url, method="GET", headers=None, data=None, timeout=600):
    req = urllib.request.Request(url, method=method, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8")), dict(resp.headers)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:800]
        raise RuntimeError(f"HTTP {e.code} {url}\n{body}") from None


def multipart(fields, file_field, file_path):
    """組 multipart/form-data。回傳 (body_bytes, content_type)。"""
    boundary = "----geo" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n"
            .encode("utf-8"))
    mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    parts.append(
        (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; "
         f"filename=\"{Path(file_path).name}\"\r\nContent-Type: {mime}\r\n\r\n")
        .encode("utf-8"))
    parts.append(Path(file_path).read_bytes())
    parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


# ---------------------------------------------------------------- 各引擎
def run_whisper_api(base_url, api_key, model, audio, lang, keyterms):
    fields = {"model": model, "response_format": "verbose_json", "temperature": "0"}
    if lang:
        fields["language"] = lang
    if keyterms:
        fields["prompt"] = "、".join(keyterms)  # whisper prompt 偏置專有名詞
    body, ctype = multipart(fields, "file", audio)
    data, _ = http_json(base_url, "POST",
                        {"Authorization": f"Bearer {api_key}", "Content-Type": ctype},
                        body)
    segs = [{"start": s["start"], "end": s["end"], "speaker": None,
             "text": s["text"].strip()} for s in data.get("segments", [])]
    return segs


def run_groq(audio, lang, keyterms, model=None):
    key = os.environ["GROQ_API_KEY"]
    return run_whisper_api("https://api.groq.com/openai/v1/audio/transcriptions",
                           key, model or "whisper-large-v3-turbo", audio, lang, keyterms)


def run_openai(audio, lang, keyterms, model=None):
    key = os.environ["OPENAI_API_KEY"]
    return run_whisper_api("https://api.openai.com/v1/audio/transcriptions",
                           key, model or "whisper-1", audio, lang, keyterms)


def run_elevenlabs(audio, lang, diarize, model=None):
    key = os.environ["ELEVENLABS_API_KEY"]
    fields = {"model_id": model or "scribe_v1"}
    if diarize:
        fields["diarize"] = "true"
    if lang:
        fields["language_code"] = "zho" if lang == "zh" else lang
    data = None
    for mid in ([fields["model_id"]] if model else ["scribe_v2", "scribe_v1"]):
        fields["model_id"] = mid
        body, ctype = multipart(fields, "file", audio)
        try:
            data, _ = http_json("https://api.elevenlabs.io/v1/speech-to-text", "POST",
                                {"xi-api-key": key, "Content-Type": ctype}, body)
            break
        except RuntimeError as e:
            if "scribe_v2" in mid and ("400" in str(e) or "404" in str(e)):
                continue
            raise
    # 依 speaker 與停頓把 word 聚成句段
    segs, cur = [], None
    for w in data.get("words", []):
        if w.get("type") == "spacing":
            continue
        spk = w.get("speaker_id")
        if (cur is None or spk != cur["speaker"]
                or w["start"] - cur["end"] > 1.2 or cur["end"] - cur["start"] > 25):
            if cur:
                segs.append(cur)
            cur = {"start": w["start"], "end": w["end"], "speaker": spk, "text": w["text"]}
        else:
            cur["end"] = w["end"]
            cur["text"] += w["text"]
    if cur:
        segs.append(cur)
    if not segs and data.get("text"):
        segs = [{"start": 0, "end": 0, "speaker": None, "text": data["text"]}]
    return segs


GEMINI_PROMPT = (
    "請將這段音訊完整轉錄為逐字稿,規則:\n"
    "1. 一律輸出繁體中文(台灣用語),英文術語保留原文。\n"
    "2. 每段開頭標時間戳 [MM:SS] 或 [H:MM:SS]。\n"
    "3. 若有多位說話者,標「發言者A:」「發言者B:」(能辨識姓名就用姓名)。\n"
    "4. 逐字忠實轉錄,不摘要、不省略;聽不清楚標 [聽不清]。\n"
    "5. 只輸出逐字稿本身,不要任何前後說明。\n"
)


def run_gemini(audio, keyterms, model=None):
    key = os.environ.get("GEMINI_API_KEY") or os.environ["GOOGLE_API_KEY"]
    base = "https://generativelanguage.googleapis.com"
    size = Path(audio).stat().st_size
    mime = mimetypes.guess_type(str(audio))[0] or "audio/mpeg"
    # Files API resumable upload(兩步)
    meta = json.dumps({"file": {"display_name": Path(audio).name}}).encode()
    req = urllib.request.Request(
        f"{base}/upload/v1beta/files?key={key}", data=meta, method="POST",
        headers={"X-Goog-Upload-Protocol": "resumable",
                 "X-Goog-Upload-Command": "start",
                 "X-Goog-Upload-Header-Content-Length": str(size),
                 "X-Goog-Upload-Header-Content-Type": mime,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        upload_url = resp.headers["X-Goog-Upload-URL"]
    data, _ = http_json(upload_url, "POST",
                        {"Content-Length": str(size),
                         "X-Goog-Upload-Offset": "0",
                         "X-Goog-Upload-Command": "upload, finalize"},
                        Path(audio).read_bytes(), timeout=1800)
    finfo = data["file"]
    while finfo.get("state") == "PROCESSING":
        time.sleep(3)
        finfo, _ = http_json(f"{base}/v1beta/{finfo['name']}?key={key}")
        finfo = finfo.get("file", finfo)
    if finfo.get("state") == "FAILED":
        raise RuntimeError("Gemini Files API:檔案處理失敗")
    prompt = GEMINI_PROMPT
    if keyterms:
        prompt += "6. 下列專有名詞照此拼寫:" + "、".join(keyterms) + "\n"
    payload = json.dumps({
        "contents": [{"parts": [
            {"text": prompt},
            {"file_data": {"file_uri": finfo["uri"], "mime_type": mime}}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 65536},
    }).encode("utf-8")
    models = [model] if model else ["gemini-3.7-flash", "gemini-3.6-flash",
                                    "gemini-3.5-flash"]
    data = None
    last = None
    for m in models:
        for attempt in range(3):
            try:
                data, _ = http_json(
                    f"{base}/v1beta/models/{m}:generateContent?key={key}",
                    "POST", {"Content-Type": "application/json"},
                    payload, timeout=1800)
                break
            except RuntimeError as e:
                last = e
                mm = re.match(r"HTTP (\d+)", str(e))
                code = int(mm.group(1)) if mm else 0
                # 過載/限流/暫時性錯誤 → 退避重試;404 → 直接換下一個模型
                if code in (429, 500, 502, 503) and attempt < 2:
                    wait = 20 * (attempt + 1)
                    info(f"{m} 回應 {code}(暫時性),{wait}s 後重試…")
                    time.sleep(wait)
                    continue
                break
        if data is not None:
            break
        info(f"{m} 不可用,改試下一個模型…")
    if data is None:
        raise last
    text = "".join(p.get("text", "")
                   for p in data["candidates"][0]["content"]["parts"])
    return parse_timestamped_text(text)


TS_LINE = re.compile(
    r"^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(?:([^:：\[\]]{1,20})[:：])?\s*(.+)$")


def parse_timestamped_text(text):
    """把「[MM:SS] 發言者: 內容」格式的文字解析成 segments。"""
    segs = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = TS_LINE.match(line)
        if m:
            h_or_m, mm, ss, spk, content = m.groups()
            t = (int(h_or_m) * 3600 + int(mm) * 60 + int(ss)) if ss \
                else (int(h_or_m) * 60 + int(mm))
            segs.append({"start": float(t), "end": float(t), "speaker": spk,
                         "text": content.strip()})
        elif segs:
            segs[-1]["text"] += line
        else:
            segs.append({"start": 0.0, "end": 0.0, "speaker": None, "text": line})
    for i, s in enumerate(segs):  # end 以下一段 start 補
        if s["end"] <= s["start"]:
            s["end"] = segs[i + 1]["start"] if i + 1 < len(segs) else s["start"] + 5
    return segs


def run_local(audio, lang, keyterms, model=None):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        die("本地引擎需要 faster-whisper:pip install faster-whisper\n"
            "(若安裝失敗多半是 Python 版本太新,見 reference/engines.md 的相容性說明;"
            "或改設任一雲端 API key)")
    name = model or "large-v3-turbo"
    info(f"載入 faster-whisper {name}(首次會下載模型)…")
    wm = WhisperModel(name, device="auto", compute_type="default")
    kwargs = {"language": lang or None, "vad_filter": True, "beam_size": 5}
    if lang == "zh":  # 繁體誘導,降低簡體輸出機率(保險仍走 opencc s2tw)
        prompt = "以下是繁體中文的逐字稿。"
        if keyterms:
            prompt += "內容包含:" + "、".join(keyterms) + "。"
        kwargs["initial_prompt"] = prompt
    elif keyterms:
        kwargs["initial_prompt"] = "、".join(keyterms)
    it, _ = wm.transcribe(str(audio), **kwargs)
    return [{"start": s.start, "end": s.end, "speaker": None, "text": s.text.strip()}
            for s in it]


# ---------------------------------------------------------------- 輸出
def to_hms(sec):
    sec = max(0, int(sec))
    return f"{sec//3600:02d}:{sec%3600//60:02d}:{sec%60:02d}"


def write_srt(segs, path):
    lines = []
    for i, s in enumerate(segs, 1):
        def fmt(t):
            ms = int(round((t - int(t)) * 1000))
            t = int(t)
            return f"{t//3600:02d}:{t%3600//60:02d}:{t%60:02d},{ms:03d}"
        text = (f"{s['speaker']}: " if s.get("speaker") else "") + s["text"]
        lines.append(f"{i}\n{fmt(s['start'])} --> {fmt(max(s['end'], s['start']+0.5))}\n{text}\n")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def try_opencc(segs):
    """嘗試 s2twp 簡轉繁;回傳是否已轉換。"""
    try:
        from opencc import OpenCC
    except ImportError:
        return False
    cc = OpenCC("s2twp")
    for s in segs:
        s["text"] = cc.convert(s["text"])
        if s.get("speaker"):
            s["speaker"] = cc.convert(s["speaker"])
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--engine", default="auto",
                    choices=["auto", "gemini", "groq", "elevenlabs", "openai", "local"])
    ap.add_argument("--lang", default="zh")
    ap.add_argument("--out", default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--keyterms", default="")
    ap.add_argument("--no-diarize", action="store_true")
    ap.add_argument("--chunk-sec", type=int, default=1500)
    a = ap.parse_args()

    src = Path(a.input)
    if not src.exists():
        die(f"找不到輸入檔:{src}(URL 請先用 yt-dlp 下載,見 engines.md)")
    outdir = Path(a.out) if a.out else src.parent / (src.stem + "_minutes")
    outdir.mkdir(parents=True, exist_ok=True)
    workdir = outdir / "_work"
    workdir.mkdir(exist_ok=True)

    engine = a.engine
    if engine == "auto":
        if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
            engine = "gemini"
        elif os.environ.get("GROQ_API_KEY"):
            engine = "groq"
        elif os.environ.get("ELEVENLABS_API_KEY"):
            engine = "elevenlabs"
        elif os.environ.get("OPENAI_API_KEY"):
            engine = "openai"
        else:
            engine = "local"
    info(f"使用引擎:{engine}")

    audio = prepare_audio(src, workdir)
    duration = ffprobe_duration(audio) or 0

    keyterms = [k.strip() for k in a.keyterms.split(",") if k.strip()]
    segs = []
    if engine == "local":
        segs = run_local(audio, a.lang, keyterms, a.model)
    elif engine == "gemini":
        segs = run_gemini(audio, keyterms, a.model)  # Gemini 免切段(≤9.5hr)
    else:
        chunks = chunk_audio(audio, a.chunk_sec, workdir)
        for off, part in chunks:
            info(f"轉錄 {part.name}(offset {to_hms(off)})…")
            if engine == "groq":
                part_segs = run_groq(part, a.lang, keyterms, a.model)
            elif engine == "openai":
                part_segs = run_openai(part, a.lang, keyterms, a.model)
            else:
                part_segs = run_elevenlabs(part, a.lang, not a.no_diarize, a.model)
            for s in part_segs:
                s["start"] += off
                s["end"] += off
            segs.extend(part_segs)

    if not segs:
        die("引擎沒有回傳任何內容")
    converted = try_opencc(segs)

    result = {"engine": engine, "language": a.lang,
              "duration_sec": round(duration, 1),
              "needs_zh_conversion": not converted,
              "source": str(src), "segments": segs}
    (outdir / "segments.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    write_srt(segs, outdir / "subtitles.srt")
    txt = "\n".join(
        f"[{to_hms(s['start'])}]" + (f" {s['speaker']}:" if s.get("speaker") else "")
        + f" {s['text']}" for s in segs)
    (outdir / "transcript_raw.txt").write_text(txt, encoding="utf-8")

    info(f"完成:{len(segs)} 段,共 {to_hms(duration)}。輸出於 {outdir}")
    if not converted:
        info("⚠ 未安裝 opencc(pip install opencc),簡轉繁請由呼叫端處理"
             "(needs_zh_conversion=true)")


if __name__ == "__main__":
    main()
