"""build_sfx.py — 効果音の整形・登録パイプライン (spec C-4)。

data/sfx-sources.json の mapping を読み、各 ID について:
  1. 候補 glob から素材を集める (raw/inbox/<id>/* をパック素材より優先)
  2. ffmpeg で正規化 (単発=-16LUFS+無音トリム+モノラル mp3 / ループ=-18LUFS+ステレオ)
  3. assets/sfx/<category>/<id>_<n>.mp3 (ループは assets/sfx/ambient/<id>.mp3) を出力
  4. assets/sfx/sfx-manifest.json / assets/sfx/CREDITS.md / sfx-pipeline/sfx-report.md を生成・更新

冪等: 素材内容+パラメータのハッシュが manifest と一致し出力が存在すれば skip。
素材が見つからない ID は sfx-report.md に「inbox 待ち」として記録しスキップ (パイプラインは止めない)。

使い方:
  py sfx-pipeline/scripts/build_sfx.py            # 全 ID
  py sfx-pipeline/scripts/build_sfx.py --only hit_flesh,coin
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sfx_common  # noqa: E402

PIPELINE_DIR = Path(__file__).resolve().parent.parent      # sfx-pipeline/
REPO_ROOT = PIPELINE_DIR.parent                            # リポジトリルート
SOURCES = PIPELINE_DIR / "data" / "sfx-sources.json"
RAW = PIPELINE_DIR / "raw"
PACKS = RAW / "packs"
OUT_DIR = REPO_ROOT / "assets" / "sfx"
MANIFEST = OUT_DIR / "sfx-manifest.json"
CREDITS = OUT_DIR / "CREDITS.md"
REPORT = PIPELINE_DIR / "sfx-report.md"


def resolve_candidate(pattern: str):
    """候補 glob を絶対パスに解決して matched files を返す。
    'raw/...' で始まれば sfx-pipeline/ 相対、それ以外は raw/packs/ 相対 (パック名/...)。"""
    if pattern.startswith("raw/"):
        base = PIPELINE_DIR / pattern
    else:
        base = PACKS / pattern
    return sorted(glob.glob(str(base), recursive=True))


def gather(entry):
    """候補順に素材を集め、takes 数まで採用。(files, source_label) を返す。"""
    files, source = [], None
    for pat in entry.get("candidates", []):
        for f in resolve_candidate(pat):
            p = Path(f)
            if p.is_file() and str(p) not in files:
                files.append(str(p))
                if source is None:
                    source = "inbox(手動)" if "/inbox/" in p.as_posix() else p.relative_to(PACKS).parts[0]
    return files[: entry.get("takes", 1)], source


def file_hash(paths, params) -> str:
    h = hashlib.sha1()
    h.update(json.dumps(params, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    for p in paths:
        try:
            h.update(Path(p).read_bytes())
        except OSError:
            h.update(p.encode("utf-8"))
    return h.hexdigest()


def pack_meta(sources, source_label):
    for pk in sources.get("packs", []):
        if pk.get("name") == source_label:
            return pk.get("license", "?"), pk.get("credit", source_label)
    if source_label == "inbox(手動)":
        return "(要 inbox の出典記入)", "(手動投入素材)"
    return "?", str(source_label)


def main(argv=None):
    ap = argparse.ArgumentParser(description="効果音 整形・登録パイプライン")
    ap.add_argument("--only", default=None, help="カンマ区切りで特定 ID だけ処理")
    args = ap.parse_args(argv)

    data = json.loads(SOURCES.read_text(encoding="utf-8"))
    mapping = data.get("mapping", {})
    only = set(args.only.split(",")) if args.only else None

    manifest = {}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}

    built, skipped, waiting, credit_rows = [], [], [], []
    for sid, entry in mapping.items():
        if only and sid not in only:
            continue
        files, source = gather(entry)
        if not files:
            waiting.append(sid)
            continue
        is_loop = bool(entry.get("loop"))
        params = {k: entry.get(k) for k in ("volume", "pitchVar", "bus", "loop", "loopStart", "loopEndOffset", "flicker", "preload")}
        h = file_hash(files, params)

        cat = "ambient" if is_loop else entry.get("category", "combat")
        if is_loop:
            rel_files = [f"{cat}/{sid}.mp3"]
        else:
            rel_files = [f"{cat}/{sid}_{i + 1}.mp3" for i in range(len(files))]
        out_paths = [OUT_DIR / r for r in rel_files]

        prev = manifest.get(sid)
        if prev and prev.get("hash") == h and all(p.exists() for p in out_paths):
            skipped.append(sid)
        else:
            try:
                if is_loop:
                    sfx_common.normalize_loop(Path(files[0]), out_paths[0])
                else:
                    for src, dst in zip(files, out_paths):
                        sfx_common.normalize_single(Path(src), dst)
            except sfx_common.SfxError as e:
                print(f"[FATAL] {e}", file=sys.stderr)
                return 2
            built.append(sid)

        lic, credit = pack_meta(data, source)
        dur = sfx_common.probe_duration(out_paths[0])
        m = {"files": rel_files, "volume": entry.get("volume", 1.0), "pitchVar": entry.get("pitchVar", 0.0),
             "bus": entry.get("bus", "sfx"), "source": source, "license": lic, "credit": credit, "hash": h}
        for k in ("loop", "loopStart", "loopEndOffset", "flicker", "preload"):
            if entry.get(k) is not None:
                m[k] = entry[k]
        if dur is not None:
            m["durationSec"] = dur
        manifest[sid] = m
        credit_rows.append((sid, ", ".join(rel_files), str(source), lic, credit))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_credits(credit_rows)
    write_report(built, skipped, waiting)

    print(f"built={len(built)} skipped(冪等)={len(skipped)} inbox待ち={len(waiting)}")
    if waiting:
        print("  inbox 待ち:", ", ".join(waiting))
    print(f"manifest: {MANIFEST.relative_to(REPO_ROOT)}  report: {REPORT.relative_to(REPO_ROOT)}")
    return 0


def write_credits(rows):
    lines = ["# 効果音(SFX)クレジット", "",
             "このファイルは `sfx-pipeline/scripts/build_sfx.py` が自動生成します。",
             "クレジット必須素材を使った場合は、ゲーム内設定画面 (audio.js openSettings) にも追記すること。", "",
             "| ID | 採用ファイル | 出典 | ライセンス | クレジット |",
             "|---|---|---|---|---|"]
    for sid, files, source, lic, credit in sorted(rows):
        lines.append(f"| {sid} | {files} | {source} | {lic} | {credit} |")
    lines.append("")
    CREDITS.write_text("\n".join(lines), encoding="utf-8")


def write_report(built, skipped, waiting):
    lines = ["# sfx-report.md (自動生成)", "",
             f"- 生成/更新: **{len(built)}** ID", f"- 冪等スキップ: **{len(skipped)}** ID",
             f"- inbox 待ち (素材なし): **{len(waiting)}** ID", "",
             "## inbox 待ち — `sfx-pipeline/raw/inbox/<id>/` に素材を置いて再実行", ""]
    lines += [f"- `{w}`" for w in waiting] or ["(なし)"]
    lines += ["", "## 生成済み", ""]
    lines += [f"- `{b}`" for b in built] or ["(なし)"]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
