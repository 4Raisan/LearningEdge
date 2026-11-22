# Native Sidecar Binaries

LearningEdge resolves native executables (`ffmpeg`, `ffprobe`, `whisper-cli`) in this priority order:

1. Explicit environment override (`LEARNINGEDGE_FFMPEG_PATH`, `LEARNINGEDGE_FFPROBE_PATH`, `LEARNINGEDGE_WHISPER_CLI_PATH`).
2. Packaged Tauri sidecar binaries alongside the application executable or under `src-tauri/binaries/` with target triple suffixes:
   - `ffmpeg-x86_64-pc-windows-msvc.exe`
   - `ffprobe-x86_64-pc-windows-msvc.exe`
   - `whisper-cli-x86_64-pc-windows-msvc.exe`
3. System `PATH` lookup.

Before creating an installer (`tauri build`), place signed/redistributable sidecar binaries in this directory and enable `bundle.externalBin` in `src-tauri/tauri.conf.json`.
