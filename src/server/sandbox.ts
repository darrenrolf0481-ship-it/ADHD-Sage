import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

const MAX_OUTPUT = 256 * 1024; // 256 KB cap per stream — a noisy script can't exhaust memory
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * Runs a snippet of JavaScript in an isolated Node child process.
 *
 * The whole point is that the *server* process can never be taken down by the
 * code under test:
 *   - it runs in a separate process (own memory, own event loop);
 *   - stdin is /dev/null, so an interactive script (e.g. one that opens a
 *     readline prompt) gets EOF immediately and can't hijack the server's stdin;
 *   - a hard timeout SIGKILLs runaway / infinite-loop code (and its whole
 *     process group);
 *   - output is capped so a flood of logs can't blow up memory;
 *   - it never throws to the caller — every outcome (crash, timeout, syntax
 *     error) comes back as a result object.
 *
 * Note: this isolates *crashes and hangs*, not *capabilities*. The child still
 * runs with the server's filesystem/network access, so the calling endpoint is
 * gated behind an explicit opt-in (see routes/sandbox.ts).
 */
export async function runInSandbox(
  code: string,
  opts: { timeoutMs?: number } = {},
): Promise<SandboxResult> {
  const timeoutMs =
    opts.timeoutMs && opts.timeoutMs > 0
      ? Math.min(opts.timeoutMs, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
  const start = Date.now();
  const dir = mkdtempSync(join(tmpdir(), 'sage-sandbox-'));
  const file = join(dir, 'snippet.cjs');
  writeFileSync(file, code, 'utf8');

  return new Promise<SandboxResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(process.execPath, ['--no-warnings', file], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'], // no shared stdin to hijack
      env: { ...process.env, NODE_ENV: 'sandbox' },
      detached: true, // own process group, so the timeout can kill the whole tree
    });

    const cleanupAndResolve = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* temp dir cleanup is best-effort */
      }
      resolve({ stdout, stderr, exitCode, timedOut, durationMs: Date.now() - start });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole process group (negative pid) so children of the snippet
      // die too; fall back to a direct kill if the group kill isn't available.
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString();
    });
    child.on('error', (e) => {
      stderr += `\n[sandbox] failed to start: ${e.message}`;
      cleanupAndResolve(null);
    });
    child.on('close', (exitCode) => cleanupAndResolve(exitCode));
  });
}
