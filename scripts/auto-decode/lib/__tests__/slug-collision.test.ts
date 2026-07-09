// scripts/auto-decode/lib/__tests__/slug-collision.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkSlugCollision, type CollisionDeps } from "../slug-collision";

describe("checkSlugCollision", () => {
  let deps: CollisionDeps;

  beforeEach(() => {
    deps = {
      fileExists: vi.fn().mockResolvedValue(false),
      listDir: vi.fn().mockResolvedValue(null),
      readFile: vi.fn().mockResolvedValue(""),
      gitLogPaths: vi.fn().mockResolvedValue(""),
    };
  });

  it("passes when slug is fresh", async () => {
    await expect(
      checkSlugCollision("axelrod-on-chain", "/repo", deps),
    ).resolves.toEqual({ ok: true });
  });

  it("fails when deliverables dir already exists with content", async () => {
    deps.fileExists = vi
      .fn()
      .mockImplementation(async (p: string) =>
        p.endsWith("deliverables/axelrod-on-chain"),
      );
    deps.listDir = vi.fn().mockResolvedValue(["decode.md"]);
    const result = await checkSlugCollision("axelrod-on-chain", "/repo", deps);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringMatching(/deliverables\/axelrod-on-chain.*exists/i),
    });
  });

  it("reclaims an EMPTY deliverables dir (crashed-run artifact)", async () => {
    deps.fileExists = vi
      .fn()
      .mockImplementation(async (p: string) =>
        p.endsWith("deliverables/axelrod-on-chain"),
      );
    deps.listDir = vi.fn().mockResolvedValue([]);
    await expect(
      checkSlugCollision("axelrod-on-chain", "/repo", deps),
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when the existing dir cannot be listed", async () => {
    deps.fileExists = vi
      .fn()
      .mockImplementation(async (p: string) =>
        p.endsWith("deliverables/axelrod-on-chain"),
      );
    deps.listDir = vi.fn().mockResolvedValue(null);
    const result = await checkSlugCollision("axelrod-on-chain", "/repo", deps);
    expect(result.ok).toBe(false);
  });

  it("fails when slug appears in next.config.ts redirects", async () => {
    deps.readFile = vi.fn().mockResolvedValue(`
      module.exports = {
        async redirects() {
          return [
            { source: "/decodes/axelrod-on-chain", destination: "/decodes/foo", permanent: true },
          ];
        },
      };
    `);
    const result = await checkSlugCollision("axelrod-on-chain", "/repo", deps);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringMatching(/redirect/i),
    });
  });

  it("fails when slug appears in git history under deliverables", async () => {
    deps.gitLogPaths = vi
      .fn()
      .mockResolvedValue("deliverables/axelrod-on-chain/decode.md\n");
    const result = await checkSlugCollision("axelrod-on-chain", "/repo", deps);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringMatching(/git history/i),
    });
  });
});
