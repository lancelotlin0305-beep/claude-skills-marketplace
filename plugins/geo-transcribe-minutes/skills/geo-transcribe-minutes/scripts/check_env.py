# -*- coding: utf-8 -*-
"""環境盤點:轉錄 skill 開工前先跑一次,回報可用引擎與缺件安裝指令。

用法: python check_env.py
輸出: 人類可讀報告 + 最後一行 RECOMMEND=<engine>(供呼叫端解析)
"""
import importlib.util
import os
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows 主控台中文


def has(mod):
    return importlib.util.find_spec(mod) is not None


def main():
    print("=== geo-transcribe-minutes 環境檢查 ===\n")

    # Python
    v = sys.version_info
    print(f"Python {v.major}.{v.minor}.{v.micro}", end="")
    py_new = (v.major, v.minor) >= (3, 13)
    if py_new:
        print("(偏新:faster-whisper/funasr 的預編譯 wheel 可能尚未支援;"
              "本地引擎裝不起來時,建議另建 3.12 環境:"
              "`uv venv --python 3.12` 或 `winget install Python.Python.3.12`)")
    else:
        print("(OK)")

    # ffmpeg / yt-dlp
    ff = shutil.which("ffmpeg")
    print(f"ffmpeg: {'OK -> ' + ff if ff else '缺 -> winget install Gyan.FFmpeg(裝完重開終端機)'}")
    yt = shutil.which("yt-dlp")
    print(f"yt-dlp: {'OK' if yt else '缺(僅下載線上影片才需要)-> winget install yt-dlp.yt-dlp'}")

    # GPU
    gpu = None
    if shutil.which("nvidia-smi"):
        try:
            r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total",
                                "--format=csv,noheader"],
                               capture_output=True, text=True, timeout=15)
            gpu = r.stdout.strip() or None
        except Exception:
            pass
    print(f"NVIDIA GPU: {gpu if gpu else '無(本地引擎走 CPU:int8 量化或 SenseVoice)'}")

    # API keys
    keys = {
        "GEMINI_API_KEY/GOOGLE_API_KEY":
            bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")),
        "GROQ_API_KEY": bool(os.environ.get("GROQ_API_KEY")),
        "ELEVENLABS_API_KEY": bool(os.environ.get("ELEVENLABS_API_KEY")),
        "OPENAI_API_KEY": bool(os.environ.get("OPENAI_API_KEY")),
    }
    print("\nAPI keys:")
    for k, ok in keys.items():
        print(f"  {k}: {'有' if ok else '無'}")

    # Python 套件
    pkgs = {"faster_whisper": "pip install faster-whisper",
            "funasr": "pip install funasr torch torchaudio",
            "opencc": "pip install opencc-python-reimplemented"}
    print("\nPython 套件:")
    for mod, cmd in pkgs.items():
        print(f"  {mod}: {'OK' if has(mod) else '缺 -> ' + cmd}")

    # 建議引擎(與 transcribe.py 的 auto 邏輯一致)
    if keys["GEMINI_API_KEY/GOOGLE_API_KEY"]:
        rec = "gemini"
    elif keys["GROQ_API_KEY"]:
        rec = "groq"
    elif keys["ELEVENLABS_API_KEY"]:
        rec = "elevenlabs"
    elif keys["OPENAI_API_KEY"]:
        rec = "openai"
    elif has("faster_whisper") or has("funasr"):
        rec = "local"
    else:
        rec = "none"

    print()
    if rec == "none":
        print("⚠ 目前沒有任何可用引擎。最快的兩條路:")
        print("  1. 免費雲端:到 https://console.groq.com 申請 key,設 GROQ_API_KEY")
        print("     (免費層每天約 8 小時音訊;或 https://aistudio.google.com 拿 GEMINI_API_KEY)")
        print("  2. 本地離線:pip install faster-whisper(CPU 亦可,int8)")
    print(f"RECOMMEND={rec}")


if __name__ == "__main__":
    main()
