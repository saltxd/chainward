// scripts/auto-decode/lib/slug-collision.ts
import { join } from "node:path";
import { stat, readFile as fsReadFile } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface CollisionDeps {
  fileExists: (path: string) => Promise<boolean>;
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
    return {
      ok: false,
      reason: `deliverables/${slug} already exists; pick a fresh slug`,
    };
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
