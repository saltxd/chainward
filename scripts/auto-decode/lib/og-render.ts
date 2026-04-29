// scripts/auto-decode/lib/og-render.ts
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn, execFile as execFileCb, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface OgDeps {
  buildWeb: (repoRoot: string) => Promise<void>;
  startWeb: (port: number, repoRoot: string) => ChildProcess;
  waitForReady: (url: string, timeoutMs: number) => Promise<void>;
  fetch: typeof fetch;
  writeFile: (path: string, data: Buffer) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
}

export interface RenderOgArgs {
  slug: string;
  repoRoot: string;
  port: number;
  deps: OgDeps;
}

export async function renderOg(args: RenderOgArgs): Promise<void> {
  const { slug, repoRoot, port, deps } = args;
  await deps.buildWeb(repoRoot);

  const child = deps.startWeb(port, repoRoot);
  try {
    await deps.waitForReady(`http://localhost:${port}/decodes/${slug}`, 60_000);

    const ogUrl = `http://localhost:${port}/api/decodes/${slug}/og`;
    const res = await deps.fetch(ogUrl, {
      headers: { "User-Agent": "Twitterbot/1.0" },
    });
    if (!res.ok) {
      throw new Error(`og fetch returned ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (
      buf.length < PNG_MAGIC.length ||
      !buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
    ) {
      throw new Error("OG response did not start with PNG magic bytes");
    }

    const target = join(
      repoRoot,
      "apps/web/public/decodes",
      slug,
      "og.png",
    );
    await deps.writeFile(target, buf);
  } finally {
    child.kill("SIGTERM");
  }
}

export const productionDeps: OgDeps = {
  async buildWeb(repoRoot) {
    await execFile("pnpm", ["--filter", "@chainward/web", "build"], {
      cwd: repoRoot,
    });
  },
  startWeb(port, repoRoot) {
    return spawn(
      "pnpm",
      ["--filter", "@chainward/web", "start", "--", "--port", String(port)],
      { cwd: repoRoot, stdio: "ignore", detached: false },
    );
  },
  async waitForReady(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(url);
        if (r.ok) return;
      } catch {
        /* not ready */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`waitForReady timeout for ${url}`);
  },
  fetch,
  async writeFile(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await fsWriteFile(path, data);
  },
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },
};
