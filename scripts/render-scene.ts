import "konva/napi-backend";
import Konva from "konva";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { auditSceneLayout, paginateScenes } from "../src/lib/renderer/layout";
import { renderSceneAtTime } from "../src/lib/renderer/templates";
import { THEME } from "../src/lib/renderer/theme";
import type { SceneSpec, SentenceCue } from "../src/lib/renderer/types";

interface RenderJobInput {
  scene: SceneSpec;
  cues: SentenceCue[];
  fps?: number;
  frame_count: number;
  width?: number;
  height?: number;
  output_mp4: string;
  ffmpeg_path?: string;
  show_captions?: boolean;
  snapshot_dir?: string | null;
}

interface PaginateInput {
  scenes: SceneSpec[];
  width?: number;
  height?: number;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && i + 1 < argv.length) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

async function writeChunk(stream: NodeJS.WritableStream, buf: Uint8Array): Promise<void> {
  if (!stream.write(buf)) {
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onErr = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        stream.off("drain", onDrain);
        stream.off("error", onErr);
      };
      stream.once("drain", onDrain);
      stream.once("error", onErr);
    });
  }
}

async function runPaginate(inputPath: string, outputPath: string) {
  const raw = await fs.readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as PaginateInput | { scenes: SceneSpec[] } | SceneSpec[];
  const scenes = Array.isArray(parsed) ? parsed : parsed.scenes;
  const width = !Array.isArray(parsed) && "width" in parsed && parsed.width ? parsed.width : THEME.width;
  const height = !Array.isArray(parsed) && "height" in parsed && parsed.height ? parsed.height : THEME.height;

  const paginated = paginateScenes(scenes, width, height);
  const audits = paginated.map((scene) => ({
    scene_id: scene.scene_id,
    metrics: auditSceneLayout(scene, width, height),
  }));

  for (const a of audits) {
    if (
      a.metrics.min_font_size < THEME.minFontSize ||
      a.metrics.max_overlap_count > 0 ||
      a.metrics.out_of_bounds_count > 0
    ) {
      throw new Error(
        `Layout audit failed after pagination for ${a.scene_id}: ${JSON.stringify(a.metrics)}`
      );
    }
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ scenes: paginated, audits }, null, 2), "utf8");
}

async function runRender(inputPath: string) {
  const raw = await fs.readFile(inputPath, "utf8");
  const job = JSON.parse(raw) as RenderJobInput;
  const width = job.width ?? THEME.width;
  const height = job.height ?? THEME.height;
  const fps = job.fps ?? 30;
  const ffmpegPath = job.ffmpeg_path || process.env.LEARNINGEDGE_FFMPEG_PATH || "ffmpeg";
  const showCaptions = job.show_captions ?? false;

  const audit = auditSceneLayout(job.scene, width, height);
  if (
    audit.min_font_size < THEME.minFontSize ||
    audit.max_overlap_count > 0 ||
    audit.out_of_bounds_count > 0
  ) {
    throw new Error(
      `Scene ${job.scene.scene_id} failed layout readability audit: min_font=${audit.min_font_size}, overlaps=${audit.max_overlap_count}, oob=${audit.out_of_bounds_count}`
    );
  }

  await fs.mkdir(path.dirname(job.output_mp4), { recursive: true });
  if (job.snapshot_dir) {
    await fs.mkdir(job.snapshot_dir, { recursive: true });
  }

  const stage = new Konva.Stage({ width, height });
  const layer = new Konva.Layer({ id: "scene-layer" });
  stage.add(layer);

  const ffmpegArgs = [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    `${fps}`,
    "-i",
    "pipe:0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-r",
    `${fps}`,
    "-video_track_timescale",
    "30000",
    "-movflags",
    "+faststart",
    job.output_mp4,
  ];

  const proc = spawn(ffmpegPath, ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitPromise = new Promise<void>((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });

  const snapshotFrames = new Set<number>();
  if (job.snapshot_dir && job.cues.length > 0) {
    for (const cue of job.cues) {
      const f = Math.min(
        Math.max(0, job.frame_count - 1),
        Math.floor(((cue.start_ms + 320) / 1000) * fps)
      );
      snapshotFrames.add(f);
    }
  }

  const totalFrames = Math.max(1, job.frame_count);
  let lastSteadyKey: string | null = null;
  let lastFrameBuf: Buffer | null = null;

  const getSteadyVisualKey = (timeMs: number): string | null => {
    if (job.cues.length === 0) {
      const endAnimMs = Math.max(0, job.scene.items.length - 1) * 350 + 300;
      return timeMs > endAnimMs ? "static-nocues" : null;
    }
    for (const cue of job.cues) {
      if (timeMs >= cue.start_ms && timeMs <= cue.start_ms + 300) {
        return null; // Inside ease-out reveal animation window
      }
    }
    const states = job.cues.map((c) => {
      if (timeMs < c.start_ms) return "0";
      if (timeMs <= c.end_ms) return "A";
      return "D";
    });
    return `${showCaptions ? "cap" : "nocap"}:${states.join("")}`;
  };

  for (let frame = 0; frame < totalFrames; frame++) {
    const timeMs = (frame / fps) * 1000;
    const steadyKey = getSteadyVisualKey(timeMs);
    let buf: Buffer;
    let canvasEl: {
      getContext: (id: "2d") => CanvasRenderingContext2D;
      toBuffer?: (mime: string) => Buffer;
    } | null = null;

    if (steadyKey !== null && steadyKey === lastSteadyKey && lastFrameBuf !== null) {
      buf = lastFrameBuf;
    } else {
      renderSceneAtTime(stage, job.scene, timeMs, job.cues, {
        showCaptions,
        width,
        height,
      });

      canvasEl = layer.getNativeCanvasElement() as unknown as {
        getContext: (id: "2d") => CanvasRenderingContext2D;
        toBuffer?: (mime: string) => Buffer;
      };
      const ctx = canvasEl.getContext("2d");
      const img = ctx.getImageData(0, 0, width, height);
      buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      if (steadyKey !== null) {
        lastSteadyKey = steadyKey;
        lastFrameBuf = Buffer.from(buf);
      } else {
        lastSteadyKey = null;
        lastFrameBuf = null;
      }
    }

    await writeChunk(proc.stdin, buf);

    if (job.snapshot_dir && snapshotFrames.has(frame)) {
      if (!canvasEl) {
        renderSceneAtTime(stage, job.scene, timeMs, job.cues, {
          showCaptions,
          width,
          height,
        });
        canvasEl = layer.getNativeCanvasElement() as unknown as {
          getContext: (id: "2d") => CanvasRenderingContext2D;
          toBuffer?: (mime: string) => Buffer;
        };
      }
      if (canvasEl.toBuffer) {
        const pngPath = path.join(job.snapshot_dir, `${job.scene.scene_id}_f${frame}.png`);
        await fs.writeFile(pngPath, canvasEl.toBuffer("image/png"));
      }
    }
  }

  proc.stdin.end();
  await exitPromise;
  stage.destroy();
  console.log(
    JSON.stringify({
      scene_id: job.scene.scene_id,
      frame_count: totalFrames,
      fps,
      output_mp4: job.output_mp4,
      audit: {
        min_font_size: audit.min_font_size,
        max_overlap_count: audit.max_overlap_count,
        out_of_bounds_count: audit.out_of_bounds_count,
      },
    })
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || "render";
  if (!args.input) {
    throw new Error("Missing --input <path>");
  }
  if (mode === "paginate") {
    if (!args.output) {
      throw new Error("Missing --output <path> for paginate mode");
    }
    await runPaginate(args.input, args.output);
  } else if (mode === "render") {
    await runRender(args.input);
  } else {
    throw new Error(`Unknown --mode ${mode}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
