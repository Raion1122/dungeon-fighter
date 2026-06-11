"""voicevox_client.py — VOICEVOX ENGINE HTTP API ラッパ。

依存: requests のみ (mp3/ogg 変換は ffmpeg を subprocess 経由で使用)。
ENGINE 既定: http://127.0.0.1:50021

requests / ffmpeg が無い環境でも `import` 自体は成功する (--help 等が動くように)。
実際に通信・変換する関数を呼んだ時点で分かりやすいエラーを出す。
"""
from __future__ import annotations

import json
import shutil
import subprocess

try:
    import requests  # type: ignore
except ImportError:  # 遅延エラーにする (import 時点では落とさない)
    requests = None


class EngineError(RuntimeError):
    """ENGINE 未起動 / ffmpeg 不在 / 変換失敗などの分かりやすいエラー。"""


def _require_requests():
    if requests is None:
        raise EngineError("requests が必要です: pip install requests")


def list_speakers(engine_url):
    """GET /speakers → 話者一覧 (name, styles[{name,id}]) を返す。"""
    _require_requests()
    url = engine_url.rstrip("/") + "/speakers"
    try:
        r = requests.get(url, timeout=10)
    except requests.exceptions.ConnectionError as e:  # type: ignore[union-attr]
        raise EngineError(
            f"VOICEVOX ENGINE に接続できません ({engine_url})。ENGINE を起動してから再実行してください。"
        ) from e
    r.raise_for_status()
    return r.json()


def find_style_ids(speakers, speaker_name):
    """話者名 (例: '青山龍星') の {style_name: id} を返す。"""
    out = {}
    for sp in speakers:
        if sp.get("name") == speaker_name:
            for st in sp.get("styles", []):
                out[st.get("name")] = st.get("id")
    return out


def synth(engine_url, text, speaker_id, params):
    """audio_query → パラメータ適用 → synthesis。wav バイト列を返す。"""
    _require_requests()
    base = engine_url.rstrip("/")
    try:
        q = requests.post(
            base + "/audio_query",
            params={"text": text, "speaker": speaker_id},
            timeout=30,
        )
    except requests.exceptions.ConnectionError as e:  # type: ignore[union-attr]
        raise EngineError(
            f"VOICEVOX ENGINE に接続できません ({engine_url})。ENGINE を起動してから再実行してください。"
        ) from e
    q.raise_for_status()
    query = q.json()
    # defaults + overrides をマージ済みの params を反映
    for k in ("speedScale", "pitchScale", "intonationScale", "volumeScale"):
        if params.get(k) is not None:
            query[k] = params[k]
    s = requests.post(
        base + "/synthesis",
        params={"speaker": speaker_id},
        data=json.dumps(query),
        headers={"Content-Type": "application/json"},
        timeout=60,
    )
    s.raise_for_status()
    return s.content


def ensure_ffmpeg():
    if shutil.which("ffmpeg") is None:
        raise EngineError(
            "ffmpeg が見つかりません。mp3/ogg 変換に必須です。インストールして PATH を通してください "
            "(Windows 例: winget install Gyan.FFmpeg)。iOS で再生できない wav をそのまま配信しないため必須。"
        )


def convert(wav_path, out_path, fmt):
    """wav を mp3 / ogg に変換 (ffmpeg)。fmt='wav' はここを通さない想定。"""
    ensure_ffmpeg()
    if fmt == "mp3":
        codec = ["-codec:a", "libmp3lame", "-q:a", "4"]
    elif fmt == "ogg":
        codec = ["-codec:a", "libvorbis", "-q:a", "4"]
    else:
        raise EngineError(f"未対応の変換フォーマット: {fmt}")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), *codec, str(out_path)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def probe_duration(path):
    """ffprobe で長さ(秒)を取得。取れなければ None。"""
    if shutil.which("ffprobe") is None:
        return None
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return round(float(out.stdout.strip()), 3)
    except Exception:
        return None
