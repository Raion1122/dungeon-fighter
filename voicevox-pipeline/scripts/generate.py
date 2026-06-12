"""generate.py — 台本 (script.json) から VOICEVOX 音声を事前生成し manifest.json を更新。

実行時 API 呼び出しはしない。ビルド前に静的 mp3 を書き出すツール。使い方は README.md 参照。

  py voicevox-pipeline/scripts/generate.py --list-speakers   # 青山龍星のスタイルID確認
  py voicevox-pipeline/scripts/generate.py                    # 全生成 (mp3, assets/voice/)
  py voicevox-pipeline/scripts/generate.py --category dungeon # dungeon だけ
  py voicevox-pipeline/scripts/generate.py --only <id>        # 特定行だけ
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import voicevox_client as vc

HERE = Path(__file__).resolve().parent
PIPELINE_ROOT = HERE.parent                       # voicevox-pipeline/
REPO_ROOT = PIPELINE_ROOT.parent                  # リポジトリ直下
DEFAULT_SCRIPT = PIPELINE_ROOT / "data" / "script.json"
DEFAULT_OUT = REPO_ROOT / "assets" / "voice"      # ゲームが配信する場所
SPEAKER_NAME = "青山龍星"


def line_hash(text, speaker_id, params):
    """text + 各パラメータのハッシュ (差分生成キー)。"""
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    h.update(str(speaker_id).encode("utf-8"))
    for k in ("speedScale", "pitchScale", "intonationScale", "volumeScale"):
        h.update(f"{k}={params.get(k)}".encode("utf-8"))
    return h.hexdigest()[:16]


def merge_params(defaults, overrides):
    p = dict(defaults or {})
    if overrides:
        p.update(overrides)
    return p


def resolve_speaker_id(line, speakers_map):
    sp = line.get("speaker")
    if isinstance(sp, str):
        return speakers_map.get(sp)
    return sp


def main(argv=None):
    ap = argparse.ArgumentParser(description="VOICEVOX ナレーション事前生成")
    ap.add_argument("--engine-url", default="http://127.0.0.1:50021")
    ap.add_argument("--script", default=str(DEFAULT_SCRIPT))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--category", choices=["quest", "dungeon", "event", "all"], default="all")
    ap.add_argument("--only", default=None, help="特定 id だけ再生成")
    ap.add_argument("--format", choices=["mp3", "ogg", "wav"], default="mp3")
    ap.add_argument("--keep-wav", action="store_true", help="中間 wav を残す (通常は付けない)")
    ap.add_argument("--list-speakers", action="store_true", help="青山龍星のスタイルID一覧を表示")
    args = ap.parse_args(argv)

    # --- 話者一覧表示 ---
    if args.list_speakers:
        try:
            speakers = vc.list_speakers(args.engine_url)
        except vc.EngineError as e:
            print(f"[FATAL] {e}", file=sys.stderr)
            return 2
        styles = vc.find_style_ids(speakers, SPEAKER_NAME)
        if not styles:
            print(f"[WARN] '{SPEAKER_NAME}' が話者一覧に見つかりません。", file=sys.stderr)
        print(f"=== {SPEAKER_NAME} のスタイル (id / name) ===")
        for name, sid in sorted(styles.items(), key=lambda x: (x[1] is None, x[1])):
            print(f"  {sid:>4}  {name}")
        return 0

    # --- 台本読込 ---
    script = json.loads(Path(args.script).read_text(encoding="utf-8"))
    speakers_map = script.get("speakers", {})
    defaults = script.get("defaults", {})
    lines = script.get("lines", [])

    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    manifest_path = out_root / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    # --- ENGINE 起動 + スタイルID検証 (警告のみ) ---
    try:
        actual = vc.find_style_ids(vc.list_speakers(args.engine_url), SPEAKER_NAME)
    except vc.EngineError as e:
        print(f"[FATAL] {e}", file=sys.stderr)
        return 2
    actual_ids = set(actual.values())
    for alias, sid in speakers_map.items():
        if sid not in actual_ids:
            print(f"[WARN] speaker '{alias}'={sid} が現 ENGINE の {SPEAKER_NAME} スタイルに見当たりません "
                  f"(バージョンで ID 変動の可能性)。", file=sys.stderr)

    ext = args.format
    ok = skip = fail = 0
    errors = []
    for ln in lines:
        lid = ln["id"]
        cat = ln.get("category", "dungeon")
        if args.only and lid != args.only:
            continue
        if not args.only and args.category != "all" and cat != args.category:
            continue

        speaker_id = resolve_speaker_id(ln, speakers_map)
        params = merge_params(defaults, ln.get("overrides"))
        h = line_hash(ln["text"], speaker_id, params)
        rel = f"{cat}/{lid}.{ext}"
        out_file = out_root / rel

        prev = manifest.get(lid)
        if not args.only and prev and prev.get("hash") == h and out_file.exists():
            skip += 1
            continue

        try:
            wav = vc.synth(args.engine_url, ln["text"], speaker_id, params)
            out_file.parent.mkdir(parents=True, exist_ok=True)
            if ext == "wav":
                out_file.write_bytes(wav)
                final = out_file
            else:
                wav_tmp = out_file.with_suffix(".wav")
                wav_tmp.write_bytes(wav)
                vc.convert(wav_tmp, out_file, ext)
                if not args.keep_wav:
                    wav_tmp.unlink(missing_ok=True)
                final = out_file
            dur = vc.probe_duration(final)
            manifest[lid] = {
                "category": cat,
                "file": rel,
                "text": ln["text"],
                "speaker": speaker_id,
                "durationSec": dur,
                "hash": h,
            }
            ok += 1
            print(f"[OK] {lid} -> {rel}" + (f" ({dur}s)" if dur is not None else ""))
        except Exception as e:  # 行単位の失敗はスキップせず記録
            fail += 1
            errors.append((lid, str(e)))
            print(f"[FAIL] {lid}: {e}", file=sys.stderr)

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n=== 完了: 生成 {ok} / スキップ {skip} / 失敗 {fail} ===")
    print(f"manifest: {manifest_path}")
    if errors:
        print("失敗一覧:")
        for lid, msg in errors:
            print(f"  - {lid}: {msg}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
