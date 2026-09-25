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


# #74 grains モード: 1 本の録音を「全体で 1 回だけ」正規化してから 1 画ずつの粒に切る。
# ⛔ 粒を normalize_single に通さない — 0.1 秒前後の粒は EBU R128 のゲート (400ms 窓) に届かず
#    loudnorm の測定値が -inf になり利得が定まらない。成功しても画ごとの強弱が全部同じ大きさに潰れる。
# ⛔ silenceremove はかけない (粒の位置がずれる)。先頭の無音は切り出しそのもので消える。
GRAIN_SR = 44100


def decode_normalized_mono(in_path: Path, sr: int = GRAIN_SR):
    """元素材をモノラル化 → loudnorm (-16 LUFS / TP -1.5) → sr へ戻した float32 列 (array('f')) を返す。
    ⭐ モノラル化を loudnorm より先に置く (ステレオのまま正規化すると、後で -ac 1 へ下ろしたとき峰が上がる)。"""
    from array import array
    ensure_ffmpeg()
    af = f"aformat=channel_layouts=mono,loudnorm=I=-16:TP=-1.5,aresample={sr}"
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(in_path), "-af", af,
         "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    a = array("f")
    a.frombytes(out[: len(out) - len(out) % 4])
    return a


def segment_grains(x, sr: int, hi_db: float, lo_db: float, merge_ms: float, min_ms: float, max_ms: float):
    """10ms 窓 RMS 包絡 (包絡の最大値を 0dB とする相対 dB) をヒステリシスで切る。
    開始 = hi_db 以上 / 終了 = lo_db 未満、隙間 < merge_ms は 1 画へ併合、長さ min_ms〜max_ms の外は捨てる。
    戻り値 = [(開始サンプル, 終了サンプル)]。"""
    import math
    w = sr // 100                       # 10ms
    n = len(x) // w
    env = []
    for i in range(n):
        acc = 0.0
        for v in x[i * w:(i + 1) * w]:
            acc += v * v
        env.append(math.sqrt(acc / w))
    top = max(env) if env else 0.0
    if top <= 0:
        return []
    ed = [20 * math.log10(e / top + 1e-12) for e in env]
    segs, on, s = [], False, 0
    for i, v in enumerate(ed):
        if not on and v >= hi_db:
            on, s = True, i
        elif on and v < lo_db:
            on = False
            segs.append([s, i])
    if on:
        segs.append([s, n])
    merged = []
    for sg in segs:
        if merged and (sg[0] - merged[-1][1]) * 10 < merge_ms:
            merged[-1][1] = sg[1]
        else:
            merged.append(sg)
    return [(a * w, b * w) for a, b in merged if min_ms <= (b - a) * 10 <= max_ms]


def write_grain_mp3(x, sr: int, start: int, end: int, pre_ms: float, fade_in_ms: float, fade_out_ms: float,
                    out_path: Path) -> None:
    """x[start - pre_ms : end] を直線フェードして 128kbps モノラル mp3 へ書く。"""
    from array import array
    ensure_ffmpeg()
    a0 = max(0, start - int(sr * pre_ms / 1000))
    seg = array("f", x[a0:end])
    n = len(seg)
    fi = min(n, max(1, int(sr * fade_in_ms / 1000)))
    fo = min(n, max(1, int(sr * fade_out_ms / 1000)))
    for i in range(fi):
        seg[i] *= i / fi
    for i in range(fo):
        seg[n - 1 - i] *= i / fo
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
         "-ac", "1", "-ar", str(sr), "-b:a", "128k", str(out_path)],
        input=seg.tobytes(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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
