import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type Boards } from './board';
import { boardRewrites } from './bake-boards';
import { rewritesFor, stillEnglish } from './copy';
import { captureScale } from './fit';
import { type ManifestEntry } from './manifest';
import { LAUNCH_FILE, STORE_DIR } from './paths';
import { type ClipJob, FPS } from './specs';

/**
 * An H.264 encoder fed PNG frames on stdin, cropping each to the clip's size about its centre.
 * A store preview also gets a silent stereo AAC track (App Store Connect expects one).
 */
function encoder(job: ClipJob, file: string) {
  const [w, h] = job.size;
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    String(FPS),
    '-i',
    '-',
  ];
  if (!job.loop) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }
  args.push(
    '-vf',
    `crop=${w}:${h},format=yuv420p`,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'slow',
    '-crf',
    '16',
    '-r',
    String(FPS),
    '-movflags',
    '+faststart',
  );
  if (!job.loop) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push(file);
  const child = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
  return {
    write: (png: Buffer) =>
      new Promise<void>((resolve, reject) => {
        child.stdin.write(png, (err) => (err ? reject(err) : resolve()));
      }),
    async end() {
      child.stdin.end();
      await done;
    },
  };
}

/** Renders each clip frame by frame from its boxes' own motion, then encodes it. */
export async function bakeClips(
  boards: Boards,
  jobs: readonly ClipJob[],
  tweaks: Record<string, unknown>,
): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  for (const job of jobs) {
    const started = Date.now();
    const page = await boards.open(LAUNCH_FILE, captureScale(job.css, 1, job.size), tweaks);
    try {
      const rewrite = rewritesFor(job.language, await boardRewrites(page));
      const file = join(STORE_DIR, job.file);
      mkdirSync(dirname(file), { recursive: true });
      const out = encoder(job, file);
      const left: string[] = [];
      let frames = 0;
      for (const shot of job.shots) {
        const sequence = await page.sequence(job.frame, shot.box, { rewrite });
        try {
          const count = Math.round(shot.seconds * FPS);
          for (let f = 0; f < count; f++) await out.write(await sequence.frame(f / FPS));
          frames += count;
        } finally {
          await sequence.done();
        }
      }
      await out.end();
      if (job.language === 'vi') {
        for (const shot of job.shots) {
          const { untranslated } = await page.capture(job.frame, shot.box, { rewrite });
          left.push(...stillEnglish(untranslated));
        }
      }
      entries.push({
        file: job.file,
        slot: job.slot,
        width: job.size[0],
        height: job.size[1],
        language: job.language,
        seconds: frames / FPS,
        source: `${job.frame} boxes ${job.shots.map((s) => s.box + 1).join(', ')}, drawn frame by frame at ${FPS} fps`,
        ...(left.length > 0 ? { stillEnglish: [...new Set(left)] } : {}),
      });
      console.log(
        `  ${job.id}: ${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`,
      );
    } finally {
      await page.close();
    }
  }
  return entries;
}
