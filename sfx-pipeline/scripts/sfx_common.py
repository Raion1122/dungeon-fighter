"""sfx_common.py — 効果音整形パイプラインの共有ヘルパ (ffmpeg ラッパ)。

voicevox-pipeline/scripts/voicevox_client.py の ensure_ffmpeg / probe_duration を踏襲。
単発SFXは loudnorm + 無音トリム + モノラル mp3、ループ素材はステレオ維持で正規化する。

ffmpeg が無い環境でも import 自体は成功する (--help 等が動くように)。実際に変換する
関数を呼んだ時点で分かりやすいエラーを出す。
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


class SfxError(RuntimeError):
    """ffmpeg 不在 / 変換失敗などの分かりやすいエラー。"""


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise SfxError(
            "ffmpeg が見つかりません。効果音の正規化に必須です。インストールして PATH を通してください "
            "(Windows 例: winget install Gyan.FFmpeg)。iOS で再生できない wav/ogg をそのまま配信しないため必須。"
        )


# 単発SFX: ラウドネス正規化 -16 LUFS + 先頭無音トリム + モノラル 44.1kHz 128kbps mp3
def normalize_single(in_path: Path, out_path: Path) -> None:
    ensure_ffmpeg()
    af = "loudnorm=I=-16:TP=-1.5,silenceremove=start_periods=1:start_threshold=-50dB"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(in_path), "-af", af,
         "-ac", "1", "-ar", "44100", "-b:a", "128k", str(out_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


# ループ素材: ラウドネス正規化 -18 LUFS + ステレオ維持 (トリムしない=継ぎ目を壊さない)
def normalize_loop(in_path: Path, out_path: Path) -> None:
    ensure_ffmpeg()
    af = "loudnorm=I=-18:TP=-1.5"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(in_path), "-af", af,
         "-ac", "2", "-ar", "44100", "-b:a", "160k", str(out_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def probe_duration(path: Path):
    """ffprobe で長さ(秒)を取得。取れなければ None。"""
    if shutil.which("ffprobe") is None:
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True, capture_output=True, text=True,
        )
        return round(float(out.stdout.strip()), 3)
    except Exception:
        return None
