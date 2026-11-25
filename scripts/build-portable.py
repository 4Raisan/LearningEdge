#!/usr/bin/env python3
"""Bundle LearningEdge + all runtime dependencies into one self-extracting EXE."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_EXE = ROOT / "src-tauri" / "target" / "release" / "learningedge.exe"
LAUNCHER_EXE = ROOT / "src-tauri" / "target" / "release" / "portable_launcher.exe"
OUT_EXE = ROOT / "dist-portable" / "LearningEdge-Portable.exe"
MAGIC = b"LEPORT01"

def find_real_node() -> Path:
    raw = subprocess.check_output(
        ["node", "-e", "console.log(process.execPath)"],
        cwd=ROOT,
        text=True,
    ).strip()
    p = Path(raw)
    if not p.is_file():
        raise FileNotFoundError(f"Real node executable not found at {p}")
    return p


def find_enclosing_node_modules(real_pkg: Path) -> Path | None:
    for parent in real_pkg.parents:
        if parent.name == "node_modules":
            return parent
    return None


def copy_node_runtime(stage_nm: Path) -> None:
    root_nm = ROOT / "node_modules"
    visited_real: set[Path] = set()
    copied_names: set[str] = set()
    queue: list[tuple[str, Path]] = [
        ("tsx", root_nm / "tsx"),
        ("konva", root_nm / "konva"),
        ("@napi-rs/canvas", root_nm / "@napi-rs" / "canvas"),
    ]

    def ignore_junk(_dir: str, names: list[str]) -> set[str]:
        return {n for n in names if n in (".bin", ".cache")}

    while queue:
        pkg_name, candidate = queue.pop(0)
        if not candidate.exists():
            continue
        real = Path(os.path.realpath(candidate))
        if real in visited_real:
            continue
        visited_real.add(real)

        dest = stage_nm / Path(*pkg_name.split("/"))
        if pkg_name not in copied_names:
            if dest.exists():
                shutil.rmtree(dest)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(real, dest, symlinks=False, ignore=ignore_junk)
            copied_names.add(pkg_name)

        enclosing_nm = find_enclosing_node_modules(real)
        if enclosing_nm and enclosing_nm.is_dir():
            for entry in sorted(enclosing_nm.iterdir()):
                if entry.name.startswith("."):
                    continue
                if entry.name.startswith("@"):
                    for sub in sorted(entry.iterdir()):
                        sub_real = Path(os.path.realpath(sub))
                        if sub_real not in visited_real:
                            queue.append((f"{entry.name}/{sub.name}", sub))
                else:
                    sub_real = Path(os.path.realpath(entry))
                    if sub_real not in visited_real:
                        queue.append((entry.name, entry))


def smoke_test(staged: Path) -> None:
    print("Running isolated runtime smoke tests...")
    subprocess.check_call(
        [str(staged / "ffmpeg.exe"), "-version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.check_call(
        [str(staged / "ffprobe.exe"), "-version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    paginate_in = staged / "_smoke_in.json"
    paginate_out = staged / "_smoke_out.json"
    paginate_in.write_text(
        json.dumps(
            {
                "width": 1280,
                "height": 720,
                "scenes": [
                    {
                        "scene_id": "s1",
                        "base_scene_id": "s1",
                        "part_index": 1,
                        "part_total": 1,
                        "title": "Smoke Test",
                        "subtitle": "Konva paginate",
                        "template": "concept_reveal",
                        "items": [
                            {
                                "id": "i1",
                                "label": "Portable Runtime",
                                "detail": "Bundled node + tsx + konva canvas test.",
                                "cue_index": 0,
                                "badge": "1",
                            }
                        ],
                        "narration_sentences": ["Testing bundled renderer layout."],
                        "note_point_ids": ["p1"],
                        "source_refs": ["src-1"],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    try:
        subprocess.check_call(
            [
                str(staged / "node.exe"),
                str(staged / "node_modules" / "tsx" / "dist" / "cli.mjs"),
                str(staged / "scripts" / "render-scene.ts"),
                "--mode",
                "paginate",
                "--input",
                str(paginate_in),
                "--output",
                str(paginate_out),
            ],
            cwd=staged,
        )
        out = json.loads(paginate_out.read_text(encoding="utf-8"))
        assert len(out.get("scenes", [])) >= 1, "Paginate smoke returned no scenes"
    finally:
        paginate_in.unlink(missing_ok=True)
        paginate_out.unlink(missing_ok=True)
    print("Smoke tests passed.")


def pack_portable(staged: Path, out_exe: Path) -> None:
    out_exe.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in staged.rglob("*") if p.is_file())
    total_raw = sum(f.stat().st_size for f in files)
    print(f"Packing {len(files)} files ({total_raw / (1024 * 1024):.1f} MiB raw)...")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".payload.gz") as tmp_gz:
        tmp_gz_path = Path(tmp_gz.name)

    try:
        with open(tmp_gz_path, "wb") as raw_f:
            with gzip.GzipFile(fileobj=raw_f, mode="wb", compresslevel=6, mtime=0) as gz:
                for path in files:
                    rel = path.relative_to(staged).as_posix().encode("utf-8")
                    size = path.stat().st_size
                    gz.write(struct.pack("<I", len(rel)))
                    gz.write(rel)
                    gz.write(struct.pack("<Q", size))
                    with open(path, "rb") as src:
                        shutil.copyfileobj(src, gz, 1024 * 1024)

        payload_len = tmp_gz_path.stat().st_size
        h = hashlib.sha256()
        with open(tmp_gz_path, "rb") as rf:
            for chunk in iter(lambda: rf.read(1024 * 1024), b""):
                h.update(chunk)
        tag = h.hexdigest()[:16].encode("ascii")

        with open(out_exe, "wb") as out_f:
            with open(LAUNCHER_EXE, "rb") as lf:
                shutil.copyfileobj(lf, out_f, 1024 * 1024)
            with open(tmp_gz_path, "rb") as pf:
                shutil.copyfileobj(pf, out_f, 1024 * 1024)
            out_f.write(struct.pack("<Q", payload_len))
            out_f.write(tag)
            out_f.write(MAGIC)

        final_size = out_exe.stat().st_size
        print(
            f"Built {out_exe} | size={final_size / (1024 * 1024):.1f} MiB "
            f"| tag={tag.decode('ascii')} | files={len(files)}"
        )
    finally:
        tmp_gz_path.unlink(missing_ok=True)


def main() -> int:
    for p, label in ((APP_EXE, "learningedge.exe"), (LAUNCHER_EXE, "portable_launcher.exe")):
        if not p.is_file():
            raise FileNotFoundError(f"Missing {label} at {p}")

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise FileNotFoundError("ffmpeg / ffprobe must be on PATH to bundle")
    real_node = find_real_node()

    with tempfile.TemporaryDirectory(prefix="le-portable-stage-") as td:
        staged = Path(td)
        shutil.copy2(APP_EXE, staged / "learningedge.exe")
        shutil.copy2(ffmpeg, staged / "ffmpeg.exe")
        shutil.copy2(ffprobe, staged / "ffprobe.exe")
        shutil.copy2(real_node, staged / "node.exe")

        (staged / "scripts").mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / "scripts" / "render-scene.ts", staged / "scripts" / "render-scene.ts")
        shutil.copy2(ROOT / "package.json", staged / "package.json")
        shutil.copy2(ROOT / "tsconfig.json", staged / "tsconfig.json")
        shutil.copytree(ROOT / "frontend" / "lib" / "renderer", staged / "frontend" / "lib" / "renderer")

        print("Staging Node runtime modules...")
        copy_node_runtime(staged / "node_modules")
        smoke_test(staged)
        pack_portable(staged, OUT_EXE)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
