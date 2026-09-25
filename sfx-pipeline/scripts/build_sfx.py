"""build_sfx.py — 効果音の整形・登録パイプライン (spec C-4)。

data/sfx-sources.json の mapping を読み、各 ID について:
  1. 候補 glob から素材を集める (raw/inbox/<id>/* をパック素材より優先)
  2. ffmpeg で正規化 (単発=-16LUFS+無音トリム+モノラル mp3 / ループ=-18LUFS+ステレオ)
  3. assets/sfx/<category>/<id>_<n>.mp3 (ループは assets/sfx/ambient/<id>.mp3) を出力
  4. assets/sfx/sfx-manifest.json / assets/sfx/CREDITS.md / sfx-pipeline/sfx-report.md を生成・更新

grains モード (#74): mapping に "grains" があれば、1 本の録音を全体で 1 回だけ正規化してから
1 画ずつの粒に切り、assets/sfx/<category>/<id>_<n>.mp3 を粒の数だけ書く (sfx_common.segment_grains)。
mapping の "source" / "license" / "credit" は pack_meta() の結果 (inbox は仮置き) より優先する。
CREDITS.md は最終 manifest の全 ID から書く (--only でも既存の行が消えない)。
書き出しは LF 固定 (Windows の Path.write_text は既定で CRLF を書く。manifest / CREDITS は .gitattributes eol=lf)。

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

    built, skipped, waiting = [], [], []
    for sid, entry in mapping.items():
        if only and sid not in only:
            continue
        files, source = gather(entry)
        if not files:
            waiting.append(sid)
            continue
        is_loop = bool(entry.get("loop"))
        grains = entry.get("grains")
        params = {k: entry.get(k) for k in ("volume", "pitchVar", "bus", "loop", "loopStart", "loopEndOffset", "flicker", "preload")}
        if grains is not None:
            params["grains"] = grains       # grains の無い既存 ID のハッシュは変えない (キーを足さない)
        h = file_hash(files, params)

        cat = "ambient" if is_loop else entry.get("category", "combat")
        prev = manifest.get(sid)
        if grains is not None:
            # 粒の数は切ってみるまで決まらない ⇒ skip 判定は前回の manifest の files で行う
            rel_files = list(prev.get("files", [])) if prev else []
        elif is_loop:
            rel_files = [f"{cat}/{sid}.mp3"]
        else:
            rel_files = [f"{cat}/{sid}_{i + 1}.mp3" for i in range(len(files))]
        out_paths = [OUT_DIR / r for r in rel_files]

        if prev and prev.get("hash") == h and out_paths and all(p.exists() for p in out_paths):
            skipped.append(sid)
        else:
            try:
                if grains is not None:
                    rel_files = build_grains(sid, cat, Path(files[0]), grains, prev)
                    out_paths = [OUT_DIR / r for r in rel_files]
                elif is_loop:
                    sfx_common.normalize_loop(Path(files[0]), out_paths[0])
                else:
                    for src, dst in zip(files, out_paths):
                        sfx_common.normalize_single(Path(src), dst)
            except sfx_common.SfxError as e:
                print(f"[FATAL] {e}", file=sys.stderr)
                return 2
            built.append(sid)

        lic, credit = pack_meta(data, source)
        # mapping に書いた出典が最優先 (inbox の仮置き「(要 inbox の出典記入)」を台帳へ残さない)
        source = entry.get("source") or source
        lic = entry.get("license") or lic
        credit = entry.get("credit") or credit
        dur = sfx_common.probe_duration(out_paths[0])
        m = {"files": rel_files, "volume": entry.get("volume", 1.0), "pitchVar": entry.get("pitchVar", 0.0),
             "bus": entry.get("bus", "sfx"), "source": source, "license": lic, "credit": credit, "hash": h}
        for k in ("loop", "loopStart", "loopEndOffset", "flicker", "preload"):
            if entry.get(k) is not None:
                m[k] = entry[k]
        if dur is not None:
            m["durationSec"] = dur
        manifest[sid] = m

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    write_credits(manifest)
    write_report(built, skipped, waiting)

    print(f"built={len(built)} skipped(冪等)={len(skipped)} inbox待ち={len(waiting)}")
    if waiting:
        print("  inbox 待ち:", ", ".join(waiting))
    print(f"manifest: {MANIFEST.relative_to(REPO_ROOT)}  report: {REPORT.relative_to(REPO_ROOT)}")
    return 0


def build_grains(sid, cat, src: Path, g, prev):
    """grains モード (#74): 全体を 1 回正規化 → 切る → <cat>/<sid>_<n>.mp3。書いた相対パスの列を返す。
    前回より粒が減ったら、余った古い粒のファイルを消す (配信物に孤児を残さない)。"""
    sr = sfx_common.GRAIN_SR
    x = sfx_common.decode_normalized_mono(src, sr)
    segs = sfx_common.segment_grains(x, sr, g["hiDb"], g["loDb"], g["mergeMs"], g["minMs"], g["maxMs"])
    if not segs:
        raise sfx_common.SfxError(f"{sid}: grains の切り出しが 0 粒 (しきい値を見直す)")
    rel = [f"{cat}/{sid}_{i + 1}.mp3" for i in range(len(segs))]
    for (a, b), r in zip(segs, rel):
        sfx_common.write_grain_mp3(x, sr, a, b, g.get("preMs", 5), g.get("fadeInMs", 2), g.get("fadeOutMs", 20),
                                   OUT_DIR / r)
    for old in (prev or {}).get("files", []):
        if old not in rel and (OUT_DIR / old).exists():
            (OUT_DIR / old).unlink()
    print(f"  {sid}: grains {len(segs)} 粒 ({rel[0]} … {rel[-1]})")
    return rel


def write_credits(manifest):
    """最終 manifest の全 ID から CREDITS.md を丸ごと書く。
    ⛔ その回に処理した ID だけで書き直さない (--only で既存の行が消えていた = #74 罠D)。"""
    rows = [(sid, ", ".join(m.get("files", [])), str(m.get("source")), m.get("license", "?"), m.get("credit", "?"))
            for sid, m in manifest.items()]
    lines = ["# 効果音(SFX)クレジット", "",
             "このファイルは `sfx-pipeline/scripts/build_sfx.py` が自動生成します。",
             "クレジット必須素材を使った場合は、ゲーム内設定画面 (audio.js openSettings) にも追記すること。", "",
             "| ID | 採用ファイル | 出典 | ライセンス | クレジット |",
             "|---|---|---|---|---|"]
    for sid, files, source, lic, credit in sorted(rows):
        lines.append(f"| {sid} | {files} | {source} | {lic} | {credit} |")
    lines.append("")
    CREDITS.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def write_report(built, skipped, waiting):
    lines = ["# sfx-report.md (自動生成)", "",
             f"- 生成/更新: **{len(built)}** ID", f"- 冪等スキップ: **{len(skipped)}** ID",
             f"- inbox 待ち (素材なし): **{len(waiting)}** ID", "",
             "## inbox 待ち — `sfx-pipeline/raw/inbox/<id>/` に素材を置いて再実行", ""]
    lines += [f"- `{w}`" for w in waiting] or ["(なし)"]
    lines += ["", "## 生成済み", ""]
    lines += [f"- `{b}`" for b in built] or ["(なし)"]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    raise SystemExit(main())
