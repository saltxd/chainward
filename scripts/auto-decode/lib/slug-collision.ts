// scripts/auto-decode/lib/slug-collision.ts
import { join } from "node:path";
import { readdir, stat, readFile as fsReadFile } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface CollisionDeps {
  fileExists: (path: string) => Promise<boolean>;
  /** Directory entry names, or null when the path doesn't exist / isn't a dir. */
  listDir: (path: string) => Promise<string[] | null>;
  readFile: (path: string) => Promise<string>;
  gitLogPaths: (pattern: string, repoRoot: string) => Promise<string>;
}

export type CollisionResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function checkSlugCollision(
  slug: string,
  repoRoot: string,
  deps: CollisionDeps,
): Promise<CollisionResult> {
  const deliverablesDir = join(repoRoot, "deliverables", slug);
  if (await deps.fileExists(deliverablesDir)) {
    // An EMPTY dir is a crashed-run artifact (the entrypoint mkdirs before the
    // long claude phase) — reclaim it instead of poisoning the slug forever.
    const entries = await deps.listDir(deliverablesDir);
    if (entries === null || entries.length > 0) {
      return {
        ok: false,
        reason: `deliverables/${slug} already exists with content; pick a fresh slug`,
      };
    }
  }

  const nextConfigPath = join(repoRoot, "apps/web/next.config.ts");
  const nextConfig = await deps.readFile(nextConfigPath);
  if (nextConfig.includes(`/decodes/${slug}`)) {
    return {
      ok: false,
      reason: `slug ${slug} appears in next.config.ts redirects (X cache risk)`,
    };
  }

  const gitOutput = await deps.gitLogPaths(`deliverables/${slug}`, repoRoot);
  if (gitOutput.trim().length > 0) {
    return {
      ok: false,
      reason: `slug ${slug} appears in git history; previously used`,
    };
  }

  return { ok: true };
}

export const productionDeps: CollisionDeps = {
  async fileExists(path: string) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },
  async listDir(path: string) {
    try {
      return await readdir(path);
    } catch {
      return null;
    }
  },
  async readFile(path: string) {
    try {
      return await fsReadFile(path, "utf-8");
    } catch {
      return "";
    }
  },
  async gitLogPaths(pattern: string, repoRoot: string) {
    const { stdout } = await execFile(
      "git",
      ["log", "--all", "--name-only", "--pretty=format:", "--", pattern],
      { cwd: repoRoot },
    );
    return stdout;
  },
};
