import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/*
 * The API under `wrangler dev --env dev` for the end-to-end tests: local D1 with the migrations
 * applied, a throwaway auth secret, and state in a temporary folder. The harness starts the
 * process in its own group and stops only that group.
 */

const API_DIR = resolve(import.meta.dirname, '../../api');
const WRANGLER = join(API_DIR, 'node_modules/.bin/wrangler');

export interface LocalApi {
  readonly base: string;
  /** Runs SQL on the local D1, for the harness only (seeding what no endpoint sets yet). */
  sql(command: string): void;
  /** The latest sign-in code sent to an address, from the simulated email binding's log. */
  emailCode(email: string): string | null;
  /** Appends a line to the transcript. */
  note(line: string): void;
  stop(): void;
}

export async function startLocalApi(port: number, transcript: string): Promise<LocalApi> {
  const state = mkdtempSync(join(tmpdir(), 'kithfield-e2e-'));
  const log = join(state, 'wrangler.log');
  const note = (line: string) => appendFileSync(transcript, `${line}\n`);
  const env = { ...process.env, NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' };

  const migrate = spawnSync(
    WRANGLER,
    [
      'd1',
      'migrations',
      'apply',
      'kithfield-dev',
      '--local',
      '--env',
      'dev',
      '--persist-to',
      state,
    ],
    { cwd: API_DIR, env, encoding: 'utf8' },
  );
  note(`$ wrangler d1 migrations apply kithfield-dev --local --env dev (exit ${migrate.status})`);
  if (migrate.status !== 0) throw new Error(`Migrations failed: ${migrate.stderr}`);

  const secret = randomBytes(24).toString('hex');
  const args = ['dev', '--env', 'dev', '--port', String(port), '--ip', '127.0.0.1'];
  args.push('--persist-to', state, '--var', `BETTER_AUTH_SECRET:${secret}`);
  args.push('--show-interactive-dev-session=false');
  const child: ChildProcess = spawn(WRANGLER, args, { cwd: API_DIR, env, detached: true });
  note(`$ wrangler dev --env dev --port ${port} (pid ${child.pid})`);
  const output: string[] = [];
  const capture = (chunk: Buffer) => {
    output.push(chunk.toString());
    appendFileSync(log, chunk);
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const base = `http://127.0.0.1:${port}/api`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline || child.exitCode !== null) {
      throw new Error(`wrangler dev did not start:\n${output.join('')}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  note(`wrangler dev is up at ${base}`);

  return {
    base,
    note,
    sql(command) {
      const args = ['d1', 'execute', 'kithfield-dev', '--local', '--env', 'dev'];
      args.push('--persist-to', state, '--command', command);
      const exec = spawnSync(WRANGLER, args, { cwd: API_DIR, env, encoding: 'utf8' });
      if (exec.status !== 0) throw new Error(`D1 failed: ${exec.stderr}`);
    },
    emailCode(email) {
      const text = readFileSync(log, 'utf8');
      const pattern = new RegExp(
        `To: ${email.replace('.', '\\.')}\\s+Subject: [^\\n]*?(\\d{6})`,
        'g',
      );
      const codes = [...text.matchAll(pattern)].map((m) => m[1] ?? '');
      return codes.at(-1) ?? null;
    },
    stop() {
      if (child.pid !== undefined && child.exitCode === null) process.kill(-child.pid, 'SIGTERM');
      appendFileSync(transcript, `\n--- wrangler output ---\n${output.join('')}`);
      rmSync(state, { recursive: true, force: true });
    },
  };
}
