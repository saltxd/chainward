// scripts/auto-decode/lib/__tests__/resolver.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveTarget, type ResolverDeps } from "../resolver";

const acpFixture = {
  data: [
    {
      id: 1048,
      name: "Wasabot",
      walletAddress: "0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D",
    },
    {
      id: 999,
      name: "AIXBT",
      walletAddress: "0xabc1234567890ABCDEF1234567890ABCDEF12345",
    },
  ],
};

describe("resolveTarget", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let deps: ResolverDeps;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => acpFixture,
    });
    deps = { fetch: fetchMock as unknown as typeof fetch };
  });

  it("passes address-kind through unchanged", async () => {
    const result = await resolveTarget(
      { kind: "address", value: "0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D" },
      deps,
    );
    expect(result).toEqual({
      address: "0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D",
      name: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves handle-kind via ACP API (case-insensitive name match)", async () => {
    const result = await resolveTarget({ kind: "handle", value: "aixbt" }, deps);
    expect(result).toEqual({
      address: "0xabc1234567890ABCDEF1234567890ABCDEF12345",
      name: "AIXBT",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("acpx.virtuals.io"),
    );
  });

  it("throws when handle not found", async () => {
    await expect(
      resolveTarget({ kind: "handle", value: "nonexistent" }, deps),
    ).rejects.toThrow(/not found in ACP/i);
  });

  it("throws when ACP API errors", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      resolveTarget({ kind: "handle", value: "AIXBT" }, deps),
    ).rejects.toThrow(/ACP API/i);
  });
});
