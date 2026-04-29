// scripts/auto-decode/lib/__tests__/og-render.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderOg, type OgDeps } from "../og-render";

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("renderOg", () => {
  let deps: OgDeps;
  let killSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    killSpy = vi.fn();
    deps = {
      buildWeb: vi.fn().mockResolvedValue(undefined),
      startWeb: vi.fn().mockReturnValue({ kill: killSpy, exitCode: null }),
      waitForReady: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.concat([PNG_MAGIC, Buffer.alloc(1024)]),
      }) as unknown as typeof fetch,
      writeFile: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("builds, starts, fetches, validates PNG magic, writes, kills", async () => {
    await renderOg({
      slug: "axelrod-on-chain",
      repoRoot: "/repo",
      port: 3001,
      deps,
    });

    expect(deps.buildWeb).toHaveBeenCalledOnce();
    expect(deps.startWeb).toHaveBeenCalledWith(3001, "/repo");
    expect(deps.waitForReady).toHaveBeenCalledOnce();
    expect(deps.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/decodes/axelrod-on-chain/og",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": "Twitterbot/1.0" }),
      }),
    );
    expect(deps.writeFile).toHaveBeenCalledWith(
      "/repo/apps/web/public/decodes/axelrod-on-chain/og.png",
      expect.any(Buffer),
    );
    expect(killSpy).toHaveBeenCalledOnce();
  });

  it("rejects when fetch returns non-PNG bytes", async () => {
    deps.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from("not a png"),
    }) as unknown as typeof fetch;

    await expect(
      renderOg({
        slug: "axelrod-on-chain",
        repoRoot: "/repo",
        port: 3001,
        deps,
      }),
    ).rejects.toThrow(/PNG magic/i);
    expect(killSpy).toHaveBeenCalledOnce(); // still cleans up
  });

  it("rejects when fetch fails", async () => {
    deps.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(
      renderOg({
        slug: "axelrod-on-chain",
        repoRoot: "/repo",
        port: 3001,
        deps,
      }),
    ).rejects.toThrow(/og fetch/i);
    expect(killSpy).toHaveBeenCalledOnce();
  });
});
