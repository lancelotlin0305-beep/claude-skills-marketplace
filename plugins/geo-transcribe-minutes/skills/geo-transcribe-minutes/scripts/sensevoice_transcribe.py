# -*- coding: utf-8 -*-
"""SenseVoiceSmall 全量轉錄:VAD 分段 → 逐段辨識 → segments.json/txt/srt
用法: py -3 sensevoice_full.py <16k單聲道wav> <輸出資料夾>
"""
import json
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import soundfile as sf
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
from opencc import OpenCC


def to_hms(sec):
    sec = max(0, int(sec))
    return f"{sec//3600:02d}:{sec%3600//60:02d}:{sec%60:02d}"


def srt_ts(t):
    ms = int(round((t - int(t)) * 1000))
    t = int(t)
    return f"{t//3600:02d}:{t%3600//60:02d}:{t%60:02d},{ms:03d}"


def main():
    wav_path, outdir = sys.argv[1], Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)

    wav, sr = sf.read(wav_path, dtype="float32")
    dur = len(wav) / sr
    print(f"[sv] 音檔 {to_hms(dur)},VAD 分段中…", flush=True)

    t0 = time.time()
    vad = AutoModel(model="fsmn-vad", device="cpu", disable_update=True, hub="hf")
    vres = vad.generate(input=wav_path)
    segs_ms = vres[0]["value"]
    print(f"[sv] VAD {len(segs_ms)} 段({time.time()-t0:.0f}s),開始辨識…", flush=True)

    m = AutoModel(model="FunAudioLLM/SenseVoiceSmall", device="cpu",
                  disable_update=True, hub="hf")
    cc = OpenCC("s2twp")
    texts = []
    BATCH = 8
    t1 = time.time()
    chunks = [wav[int(s * sr / 1000):int(e * sr / 1000)] for s, e in segs_ms]
    for i in range(0, len(chunks), BATCH):
        rs = m.generate(input=chunks[i:i + BATCH], fs=sr, language="zh", use_itn=True)
        texts += [rich_transcription_postprocess(r["text"]) for r in rs]
        if (i // BATCH) % 10 == 0:
            print(f"[sv] {min(i+BATCH,len(chunks))}/{len(chunks)} 段", flush=True)
    infer = time.time() - t1
    print(f"[sv] 辨識完成 {infer:.0f}s(約 {dur/infer:.1f}x 即時)", flush=True)

    segs = []
    for (s, e), t in zip(segs_ms, texts):
        t = cc.convert(t.strip())
        if t:
            segs.append({"start": round(s / 1000, 2), "end": round(e / 1000, 2),
                         "speaker": None, "text": t})

    (outdir / "segments.json").write_text(json.dumps(
        {"engine": "sensevoice", "language": "zh", "duration_sec": round(dur, 1),
         "needs_zh_conversion": False, "source": wav_path, "segments": segs},
        ensure_ascii=False, indent=1), encoding="utf-8")
    (outdir / "transcript_raw.txt").write_text(
        "\n".join(f"[{to_hms(s['start'])}] {s['text']}" for s in segs), encoding="utf-8")
    (outdir / "subtitles.srt").write_text(
        "\n".join(f"{i}\n{srt_ts(s['start'])} --> {srt_ts(max(s['end'], s['start']+.5))}\n{s['text']}\n"
                  for i, s in enumerate(segs, 1)), encoding="utf-8")
    print(f"[sv] 完成:{len(segs)} 段 → {outdir}", flush=True)


if __name__ == "__main__":
    main()
