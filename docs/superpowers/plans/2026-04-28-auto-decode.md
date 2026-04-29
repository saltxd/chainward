# Auto-Decode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the existing decode pipeline end-to-end. A request like `decode @AIXBT` produces a published article at `chainward.ai/decodes/<slug>` and a launch tweet from `@chainwardai`, with multi-agent verification replacing all human review checkpoints.

**Architecture:** A Claude Code session on sg-scribe is the orchestrator. It invokes `claude --print` with `--model claude-opus-4-7` and `--mcp-config` pointing at the local homelab-mcp. The orchestrator spawns specialty Task subagents for research (3 in parallel), writing, and verification (3 in parallel). All sessions are OAuth-backed (zero per-token cost) and reuse the token already in use by Claude_Dev and bookstack-curator. A TypeScript entrypoint validates inputs, picks a slug, sets up the deliverables directory, invokes claude, and posts the result to a Discord webhook.

**Tech Stack:** TypeScript (tsx) for the entrypoint and helpers; Vitest for unit tests; bash only for the publish-step shell-outs (deploy.sh, gh workflow run); Claude Code CLI v2.x; homelab-mcp on sg-scribe; Next.js 15 (already deployed) for OG card pre-render.

**Spec:** `docs/superpowers/specs/2026-04-28-auto-decode-design.md`

---

## File Map

**Created:**
- `scripts/auto-decode/index.ts` — entrypoint. Validates target, resolves to address, picks slug, sets up deliverables dir, invokes claude, extracts DISCORD_SUMMARY block, POSTs to webhook. Run via `pnpm decode:auto`.
- `scripts/auto-decode/og-render.ts` — CLI wrapper around `lib/og-render.ts`. Run via `pnpm decode:og-render <slug>`.
- `scripts/auto-decode/lib/validators.ts` — pure functions: `isAddress`, `isAgentHandle`, `slugify`, `parseTarget`
- `scripts/auto-decode/lib/resolver.ts` — ACP API target resolver
- `scripts/auto-decode/lib/slug-collision.ts` — checks deliverables dir, redirects, git log
- `scripts/auto-decode/lib/og-render.ts` — local Next.js spin-up + OG fetch + validate + kill
- `scripts/auto-decode/lib/__tests__/validators.test.ts`
- `scripts/auto-decode/lib/__tests__/resolver.test.ts`
- `scripts/auto-decode/lib/__tests__/slug-collision.test.ts`
- `scripts/auto-decode/lib/__tests__/og-render.test.ts`
- `scripts/auto-decode-prompts/orchestrator.md` — pipeline driver system prompt
- `scripts/auto-decode-prompts/identity-chain.md`
- `scripts/auto-decode-prompts/token-economics.md`
- `scripts/auto-decode-prompts/utility-audit.md`
- `scripts/auto-decode-prompts/writer.md`
- `scripts/auto-decode-prompts/citation-verifier.md`
- `scripts/auto-decode-prompts/failure-mode-verifier.md`
- `scripts/auto-decode-prompts/voice-verifier.md`
- `scripts/auto-decode.mcp.json` — MCP config pointing at sg-scribe's homelab-mcp
- `scripts/auto-decode/package.json` — declares `@chainward/auto-decode` workspace package, vitest devDep

**Modified:**
- `package.json` — add `"decode:auto"` and `"decode:og-render"` script entries
- `pnpm-workspace.yaml` — add `scripts/auto-decode` so vitest tests can run as a workspace
- `docs/decode-publishing-runbook.md` — add "Auto-Decode" section, mark old manual flow as "fallback for failed automated decodes"

**On sg-scribe (out-of-repo, documented in plan):**
- `~/.config/systemd/user/auto-decode.env` — `CLAUDE_CODE_OAUTH_TOKEN`, `DISCORD_WEBHOOK_URL`, `GH_TOKEN`, `DRY_RUN=true`
- `~/.claude/discord-system-prompt.txt` — Claude_Dev's prompt gets a decode-trigger section appended (Task 22)

---

## Task 1: Set up workspace, directory structure, env file, MCP config

**Files:**
- Create: `scripts/auto-decode/lib/`
- Create: `scripts/auto-decode/package.json`
- Create: `scripts/auto-decode-prompts/`
- Create: `scripts/auto-decode.mcp.json`
- Create: `scripts/auto-decode/.env.example`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Create the directory structure**

```bash
cd ~/Forge/chainward
mkdir -p scripts/auto-decode/lib/__tests__
mkdir -p scripts/auto-decode-prompts
```

- [ ] **Step 2: Add scripts/auto-decode to pnpm workspaces**

Modify `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "scripts/auto-decode"
```

- [ ] **Step 3: Create `scripts/auto-decode/package.json`**

```json
{
  "name": "@chainward/auto-decode",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Install the new workspace**

```bash
cd ~/Forge/chainward
pnpm install
```

Expected: vitest installed in scripts/auto-decode/node_modules; no errors about missing workspace.

- [ ] **Step 5: Smoke test vitest is wired**

```bash
cat > scripts/auto-decode/lib/__tests__/sanity.test.ts <<'EOF'
import { describe, expect, it } from "vitest";
describe("sanity", () => {
  it("vitest works", () => expect(1 + 1).toBe(2));
});
EOF

pnpm --filter @chainward/auto-decode test
```

Expected: 1 test passes.

```bash
rm scripts/auto-decode/lib/__tests__/sanity.test.ts
```

- [ ] **Step 6: Write `scripts/auto-decode.mcp.json`**

```json
{
  "mcpServers": {
    "homelab": {
      "type": "sse",
      "url": "http://localhost:8100/sse"
    }
  }
}
```

This URL is correct only when run on sg-scribe. The orchestrator session connects to sg-scribe's local homelab-mcp instance (the one with all 68 tools, including `python_exec`).

- [ ] **Step 7: Write `scripts/auto-decode/.env.example`**

```bash
# Copy to ~/.config/systemd/user/auto-decode.env on sg-scribe (chmod 0600).
# Reuses the same OAuth token Claude_Dev uses; rotate together.

CLAUDE_CODE_OAUTH_TOKEN=<paste from ~/.config/systemd/user/claude-discord.env>
DISCORD_WEBHOOK_URL=<dedicated #decode-pipeline channel webhook, ideally — separate from #alerts>
GH_TOKEN=<personal access token with workflow scope, for posting to chainward-bot>

# Calibration toggle — flip to `false` only after the dry-run gate (Task 19) passes.
DRY_RUN=true
```

- [ ] **Step 8: Commit**

```bash
git add scripts/auto-decode/package.json scripts/auto-decode.mcp.json \
        scripts/auto-decode/.env.example pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: scaffold auto-decode workspace + MCP config + env template"
```

---

## Task 2: Validators (TDD)

**Files:**
- Test: `scripts/auto-decode/lib/__tests__/validators.test.ts`
- Create: `scripts/auto-decode/lib/validators.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// scripts/auto-decode/lib/__tests__/validators.test.ts
import { describe, expect, it } from "vitest";
import { isAddress, isAgentHandle, slugify, parseTarget } from "../validators";

describe("isAddress", () => {
  it("accepts valid Base addresses", () => {
    expect(isAddress("0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D")).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(isAddress("0x5Dfc")).toBe(false);
    expect(isAddress("not-an-address")).toBe(false);
    expect(isAddress("")).toBe(false);
  });
  it("is case-insensitive on the hex portion", () => {
    expect(isAddress("0x5dfc180212204fff869d41faa9f1b430d2036f5d")).toBe(true);
  });
});

describe("isAgentHandle", () => {
  it("accepts @-prefixed alphanumeric/dash/underscore", () => {
    expect(isAgentHandle("@AIXBT")).toBe(true);
    expect(isAgentHandle("@axelrod-v2")).toBe(true);
    expect(isAgentHandle("@ethy_ai")).toBe(true);
  });
  it("rejects without @", () => {
    expect(isAgentHandle("AIXBT")).toBe(false);
  });
  it("rejects spaces or invalid chars", () => {
    expect(isAgentHandle("@aix bt")).toBe(false);
    expect(isAgentHandle("@aix.bt")).toBe(false);
  });
});

describe("slugify", () => {
  it("produces canonical -on-chain slug", () => {
    expect(slugify("AIXBT")).toBe("aixbt-on-chain");
    expect(slugify("Axelrod")).toBe("axelrod-on-chain");
    expect(slugify("Ethy AI")).toBe("ethy-ai-on-chain");
  });
  it("handles special characters", () => {
    expect(slugify("Otto.AI")).toBe("otto-ai-on-chain");
    expect(slugify("Agent_X-2")).toBe("agent-x-2-on-chain");
  });
  it("collapses repeated dashes", () => {
    expect(slugify("Foo --Bar")).toBe("foo-bar-on-chain");
  });
});

describe("parseTarget", () => {
  it("returns address kind for hex inputs", () => {
    expect(parseTarget("0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D")).toEqual({
      kind: "address",
      value: "0x5Dfc180212204Fff869d41FAA9f1b430D2036f5D",
    });
  });
  it("returns handle kind for @ inputs", () => {
    expect(parseTarget("@AIXBT")).toEqual({ kind: "handle", value: "AIXBT" });
  });
  it("throws on invalid", () => {
    expect(() => parseTarget("garbage")).toThrow(/invalid target/i);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `cd ~/Forge/chainward && pnpm --filter @chainward/auto-decode test validators`
Expected: FAIL with module-not-found (`../validators` does not exist).

- [ ] **Step 3: Implement `scripts/auto-decode/lib/validators.ts`**

```typescript
// scripts/auto-decode/lib/validators.ts

export type Target =
  | { kind: "address"; value: string }
  | { kind: "handle"; value: string };

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@[A-Za-z0-9_-]+$/;

export function isAddress(input: string): boolean {
  return ADDRESS_RE.test(input);
}

export function isAgentHandle(input: string): boolean {
  return HANDLE_RE.test(input);
}

export function parseTarget(input: string): Target {
  if (isAddress(input)) return { kind: "address", value: input };
  if (isAgentHandle(input)) return { kind: "handle", value: input.slice(1) };
  throw new Error(`invalid target: ${input} (expected 0x... or @handle)`);
}

export function slugify(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return `${cleaned}-on-chain`;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm --filter @chainward/auto-decode test validators`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-decode/lib/validators.ts scripts/auto-decode/lib/__tests__/validators.test.ts
git commit -m "feat(auto-decode): target parsers + slugifier"
```

---

## Task 3: ACP target resolver (TDD)

**Files:**
- Test: `scripts/auto-decode/lib/__tests__/resolver.test.ts`
- Create: `scripts/auto-decode/lib/resolver.ts`

This task resolves a `@handle` to an on-chain address by querying the ACP API. Address inputs pass through unchanged.

- [ ] **Step 1: Write failing tests**

```typescript
// scripts/auto-decode/lib/__tests__/resolver.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveTarget, type ResolverDeps } from "../resolver";

const acpFixture = {
  agents: [
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
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chainward/auto-decode test resolver`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `scripts/auto-decode/lib/resolver.ts`**

```typescript
// scripts/auto-decode/lib/resolver.ts
import type { Target } from "./validators";

const ACP_AGENTS_URL = "https://acpx.virtuals.io/api/agents";

export interface ResolverDeps {
  fetch: typeof fetch;
}

export interface ResolvedTarget {
  address: string;
  name: string | null;
}

interface AcpAgentRecord {
  id: number;
  name: string;
  walletAddress: string;
}

interface AcpAgentsResponse {
  agents: AcpAgentRecord[];
}

export async function resolveTarget(
  target: Target,
  deps: ResolverDeps,
): Promise<ResolvedTarget> {
  if (target.kind === "address") {
    return { address: target.value, name: null };
  }

  const res = await deps.fetch(ACP_AGENTS_URL);
  if (!res.ok) {
    throw new Error(`ACP API returned ${(res as Response).status}`);
  }

  const body = (await res.json()) as AcpAgentsResponse;
  const wanted = target.value.toLowerCase();
  const match = body.agents.find((a) => a.name.toLowerCase() === wanted);
  if (!match) {
    throw new Error(`@${target.value} not found in ACP registry`);
  }

  return { address: match.walletAddress, name: match.name };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm --filter @chainward/auto-decode test resolver`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-decode/lib/resolver.ts scripts/auto-decode/lib/__tests__/resolver.test.ts
git commit -m "feat(auto-decode): ACP target resolver"
```

---

## Task 4: Slug collision check (TDD)

**Files:**
- Test: `scripts/auto-decode/lib/__tests__/slug-collision.test.ts`
- Create: `scripts/auto-decode/lib/slug-collision.ts`

The publishing runbook says slug renames burn X cache entries. This module fails fast on three conditions: deliverables dir already exists, slug appears in next.config.ts redirects, slug appears in git history.

- [ ] **Step 1: Write failing tests**

```typescript
// scripts/auto-decode/lib/__tests__/slug-collision.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkSlugCollision, type CollisionDeps } from "../slug-collision";

describe("checkSlugCollision", () => {
  let deps: CollisionDeps;

  beforeEach(() => {
    deps = {
      fileExists: vi.fn().mockResolvedValue(false),
      readFile: vi.fn().mockResolvedValue(""),
      gitLogPaths: vi.fn().mockResolvedValue(""),
    };
  });

  it("passes when slug is fresh", async () => {
    await expect(
      checkSlugCollision("axelrod-on-chain", "/repo", deps),
    ).resolves.toEqual({ ok: true });
  });

  it("fails when deliverables dir already exists", async () => {
    deps.fileExists = vi
      .fn()
      .mockImplementation(async (p: string) =>
        p.endsWith("deliverables/axelrod-on-chain"),
      );
    const result = await checkSlugCollision("axelrod-on-chain", "/repo", deps);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringMatching(/deliverables\/axelrod-on-chain.*exists/i),
    });
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
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chainward/auto-decode test slug-collision`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `scripts/auto-decode/lib/slug-collision.ts`**

```typescript
// scripts/auto-decode/lib/slug-collision.ts
import { join } from "node:path";

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
```

Provide the production deps wrapper at the end of the same file:

```typescript
// scripts/auto-decode/lib/slug-collision.ts (continued, append)
import { stat, readFile as fsReadFile } from "node:fs/promises";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

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
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm --filter @chainward/auto-decode test slug-collision`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-decode/lib/slug-collision.ts scripts/auto-decode/lib/__tests__/slug-collision.test.ts
git commit -m "feat(auto-decode): slug collision check (dir + redirects + git history)"
```

---

## Task 5: Local OG pre-render helper (TDD with mocked subprocess)

**Files:**
- Test: `scripts/auto-decode/lib/__tests__/og-render.test.ts`
- Create: `scripts/auto-decode/lib/og-render.ts`

This module owns the "spin up Next.js, fetch /api/decodes/<slug>/og, save PNG, kill server" dance. Tests use mocked subprocess + fetch; integration test happens in Task 21.

- [ ] **Step 1: Write failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `pnpm --filter @chainward/auto-decode test og-render`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `scripts/auto-decode/lib/og-render.ts`**

```typescript
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

// Production deps factory below — uses real subprocess + fs + fetch.
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
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `pnpm --filter @chainward/auto-decode test og-render`
Expected: All pass.

- [ ] **Step 5: Add CLI wrapper at `scripts/auto-decode/og-render.ts`**

The orchestrator's publish phase shells out to render OG. Provide a CLI wrapper:

```typescript
// scripts/auto-decode/og-render.ts
import { renderOg, productionDeps } from "./lib/og-render.js";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: tsx scripts/auto-decode/og-render.ts <slug>");
  process.exit(2);
}

const port = Number(process.env.OG_RENDER_PORT ?? 3001);
const repoRoot = process.cwd();

await renderOg({ slug, repoRoot, port, deps: productionDeps });
console.log(`[og-render] wrote apps/web/public/decodes/${slug}/og.png`);
```

Add a root package.json script entry:

```json
"decode:og-render": "tsx scripts/auto-decode/og-render.ts"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/auto-decode/lib/og-render.ts \
        scripts/auto-decode/lib/__tests__/og-render.test.ts \
        scripts/auto-decode/og-render.ts \
        package.json
git commit -m "feat(auto-decode): local OG pre-render helper + CLI wrapper"
```

---

## Task 6: Entrypoint script skeleton (no claude invocation yet)

**Files:**
- Create: `scripts/auto-decode/index.ts`
- Modify: `package.json`

This task wires the lib together but stops before `claude --print`. It validates target → resolves → checks slug → creates `deliverables/<slug>/` → prints what it WOULD invoke. The Claude invocation lands in Task 18.

- [ ] **Step 1: Write `scripts/auto-decode/index.ts`**

```typescript
// scripts/auto-decode/index.ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseTarget, slugify } from "./lib/validators.js";
import { resolveTarget } from "./lib/resolver.js";
import {
  checkSlugCollision,
  productionDeps as collisionDeps,
} from "./lib/slug-collision.js";

interface Config {
  repoRoot: string;
  oauthToken: string;
  webhookUrl: string;
  ghToken: string;
  dryRun: boolean;
}

function loadConfig(): Config {
  // pnpm scripts run from package.json dir = repo root, so cwd is reliable
  const repoRoot = process.cwd();
  const required = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`missing env var: ${name}`);
    return v;
  };
  return {
    repoRoot,
    oauthToken: required("CLAUDE_CODE_OAUTH_TOKEN"),
    webhookUrl: required("DISCORD_WEBHOOK_URL"),
    ghToken: required("GH_TOKEN"),
    dryRun: process.env.DRY_RUN !== "false",
  };
}

async function main() {
  const rawTarget = process.argv[2];
  if (!rawTarget) {
    console.error("usage: pnpm decode:auto <0xADDRESS|@HANDLE>");
    process.exit(2);
  }

  const config = loadConfig();
  const target = parseTarget(rawTarget);
  const resolved = await resolveTarget(target, { fetch });
  const name = resolved.name ?? target.value;
  const slug = slugify(name);

  console.log(`[auto-decode] target=${rawTarget} → name=${name} address=${resolved.address}`);
  console.log(`[auto-decode] slug=${slug}`);

  const collision = await checkSlugCollision(slug, config.repoRoot, collisionDeps);
  if (!collision.ok) {
    console.error(`[auto-decode] slug collision: ${collision.reason}`);
    process.exit(3);
  }

  const deliverables = join(config.repoRoot, "deliverables", slug);
  await mkdir(deliverables, { recursive: true });
  console.log(`[auto-decode] created ${deliverables}`);

  console.log(
    `[auto-decode] dryRun=${config.dryRun} — would now invoke claude --print with auto-decode-prompts/orchestrator.md`,
  );
}

main().catch((err) => {
  console.error(`[auto-decode] error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Add to root `package.json` scripts**

In `package.json`, add to `"scripts"`:

```json
"decode:auto": "tsx scripts/auto-decode/index.ts"
```

Also ensure `tsx` is available — root `package.json` already has tsx (used by `decode:candidates`). No additional install needed.

- [ ] **Step 3: Smoke test (no claude yet)**

Set fake env values just to satisfy the loader:

```bash
cd ~/Forge/chainward
CLAUDE_CODE_OAUTH_TOKEN=stub DISCORD_WEBHOOK_URL=stub GH_TOKEN=stub DRY_RUN=true \
  pnpm decode:auto @AIXBT
```

Expected output:
```
[auto-decode] target=@AIXBT → name=AIXBT address=0x...
[auto-decode] slug=aixbt-on-chain
[auto-decode] slug collision: deliverables/aixbt-on-chain already exists; pick a fresh slug
```

(Yes, AIXBT will collide because the AIXBT decode shipped 2026-04-27. That's the test passing — collision detector works.)

Then test with a new target:
```bash
CLAUDE_CODE_OAUTH_TOKEN=stub DISCORD_WEBHOOK_URL=stub GH_TOKEN=stub DRY_RUN=true \
  pnpm decode:auto @Axelrod
```

Expected output:
```
[auto-decode] target=@Axelrod → name=Axelrod address=0x...
[auto-decode] slug=axelrod-on-chain
[auto-decode] created /Users/.../Forge/chainward/deliverables/axelrod-on-chain
[auto-decode] dryRun=true — would now invoke claude --print ...
```

- [ ] **Step 4: Clean up the stub deliverables/axelrod-on-chain dir from the smoke test**

```bash
rm -rf ~/Forge/chainward/deliverables/axelrod-on-chain
```

(We'll let the real run create it for keeps in Task 19.)

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-decode/index.ts package.json
git commit -m "feat(auto-decode): entrypoint skeleton (validates target, picks slug, scaffolds deliverables/)"
```

---

## Task 7: Identity-chain subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/identity-chain.md`

This subagent traces ownership: who deployed/owns the wallet, contract types in the path (proxy/factory/multisig), declared owner per ACP API, and reconciliation between declared and on-chain reality.

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/identity-chain.md` with this exact content:

````markdown
# Identity-Chain Subagent

You are a ChainWard on-chain researcher specializing in **identity and ownership**. Your job is to trace the full ownership chain of an AI agent's on-chain footprint and produce `deliverables/<slug>/identity-chain.md`.

## Required reading before you start

- Read `~/.claude/skills/onchain-decode/SKILL.md` (methodology)
- Read BookStack page 172 ("On-Chain Decode Runbook") via `bookstack_get_page` for verification standards

## Inputs (passed by orchestrator)

- `TARGET_ADDRESS` — the agent's primary on-chain address (ACP wallet, Sentient wallet, or stated public address)
- `TARGET_NAME` — the agent's display name (e.g., "Axelrod")
- `SLUG` — canonical slug (e.g., "axelrod-on-chain")
- `DELIVERABLES_DIR` — absolute path; write your output here

## What to produce

Write `<DELIVERABLES_DIR>/identity-chain.md`. Structure:

1. **Wallet topology** — table of all related addresses (ACP wallet, Sentient wallet, owner EOA, deployer, paymaster, bundler, token contracts, LP positions). For each row: address, role, source of identification (tx hash / Blockscout label / ACP API field).

2. **Ownership extraction** — for the primary contract(s) at `TARGET_ADDRESS`:
   - Is it an EOA, ERC-4337 smart account, proxy, or direct contract?
   - If proxy: the implementation address and the upgrade authority.
   - If multisig: signer count + threshold + signer addresses.
   - If smart account: factory + entry point + paymaster.
   - Cite a sentinel RPC call OR Blockscout for each fact.

3. **Declared vs observed reconciliation** — what does ACP API / Virtuals API claim for `creator`, `owner`, `deployer`? Does the on-chain state agree? Flag any mismatches.

4. **Deployment provenance** — when was the contract deployed, by whom, in what tx. Include block number.

## Tools you must use

- `ssh_exec` to `cw-sentinel` for `eth_getTransactionByHash`, `eth_getStorageAt`, `eth_getCode`
- `web_fetch` for Blockscout (`https://base.blockscout.com/api/v2/addresses/<addr>`) and ACP API
- `python_exec` for ABI decoding and storage-slot computation (EIP-1967 implementation slot is `0x360894...`)

## Hard rules

- **Source every claim.** Every row in every table cites either a tx hash, a Blockscout URL, or an ACP API endpoint. Uncited rows are forbidden.
- **No speculation about identity.** "Owner is 0xabc..." is a claim; "owner is a known whale" is speculation — drop it.
- **Sentinel is preferred over Blockscout** for any RPC fact. Note explicitly when a fact is Blockscout-only because the sentinel pruning window cut off.
- **ERC-4337 awareness.** Smart accounts show `nonce=1` despite millions of transfers. Always cross-check via token transfer count, not tx count.
- **Output language.** Plain English, factual. No prose flourishes — that's the writer's job, not yours.

## Output format

Markdown. ~150-300 lines. Reference the AIXBT identity-chain.md (`deliverables/aixbt-on-chain/identity-chain.md`) for house style — note that file's structure and tone, replicate it.

When you finish, your last terminal output line should be exactly:
```
IDENTITY_CHAIN_DONE: <DELIVERABLES_DIR>/identity-chain.md
```
````

- [ ] **Step 2: Smoke test against AIXBT (compare to existing artifact)**

This is a manual integration test. From the chainward repo root, in this Claude Code session:

1. Read `deliverables/aixbt-on-chain/identity-chain.md` end-to-end as the ground-truth artifact.
2. Use the Task tool to spawn a subagent with the prompt above, passing `TARGET_ADDRESS=<AIXBT primary address from existing artifact>`, `TARGET_NAME=AIXBT`, `SLUG=aixbt-on-chain-test`, `DELIVERABLES_DIR=/tmp/auto-decode-smoke/aixbt-on-chain-test`.
3. Compare the subagent's output to the original. Acceptance criteria: subagent identifies the same wallet topology (ACP/Sentient/owner addresses match), the same primary contract type, and the same ownership/proxy structure. Wording will differ; structure should match.
4. If the subagent **misses** something the original caught (e.g., misses a multisig, misclassifies a smart account), iterate on the prompt — usually by tightening a "Hard rules" bullet — and re-run.
5. If the subagent **fabricates** something (claim with no citation, or citation that doesn't match), STOP and tighten the "Source every claim" rule. This is a fundamental failure of the subagent prompt; verifier wouldn't catch it because the verifier reads the same artifacts.

- [ ] **Step 3: Clean up smoke-test output**

```bash
rm -rf /tmp/auto-decode-smoke
```

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-decode-prompts/identity-chain.md
git commit -m "feat(auto-decode): identity-chain subagent prompt"
```

---

## Task 8: Token-economics subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/token-economics.md`

This subagent investigates any token launched by or associated with the agent. If the agent has no token (many don't), the artifact says so plainly.

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/token-economics.md` with this exact content:

````markdown
# Token-Economics Subagent

You are a ChainWard on-chain researcher specializing in **token economics**. Your job is to investigate any token launched by or strongly associated with an AI agent and produce `deliverables/<slug>/token-economics.md`.

## Required reading before you start

- Read `~/.claude/skills/onchain-decode/SKILL.md`
- Read `deliverables/aixbt-on-chain/token-economics.md` for house style

## Inputs

- `TARGET_ADDRESS` — agent's primary on-chain address
- `TARGET_NAME` — agent display name
- `SLUG` — canonical slug
- `DELIVERABLES_DIR` — absolute path

## What to produce

Write `<DELIVERABLES_DIR>/token-economics.md`.

**If the agent has no associated token, write a 1-paragraph artifact stating that, with evidence**: ACP API token field is null, no Virtuals graduation event, no major ERC-20 transfers from the agent's wallet to a Uniswap V3 pool. Do NOT invent a token to fill the artifact.

**If the agent does have a token**, structure:

1. **Token identification** — contract address, ticker, deployer, deployment block. Cite via Virtuals API or Blockscout.
2. **Supply** — total supply, circulating supply (if calculable from transfers minus dead-address holdings), decimal places.
3. **Distribution at launch** — the post-deployment top-N holder snapshot. Cite via Blockscout token holders API or sentinel `balanceOf` calls.
4. **Distribution today** — top holders right now. Concentration metric: % held by top 10.
5. **Vesting / locks** — any vesting contracts in the holder list (cite contract type), any LP locks, team allocations.
6. **Trading footprint** — primary DEX pool address, current TVL, 24h volume (cite via DEX subgraph or sentinel pool reads).
7. **Burns / treasury actions** — any transfers to the dead address, any token-buyback patterns from the agent's revenue.

## Tools

- `ssh_exec` cw-sentinel for `balanceOf`, `totalSupply` reads
- `web_fetch` for Blockscout `/api/v2/tokens/<address>/holders`, Virtuals API
- `python_exec` for ERC-20 decimals scaling and percentage math

## Hard rules

- **No token = explicit no-token artifact.** Don't invent associations.
- **Burns require an actual transfer to dead address.** Cite the tx. Sending to `0x000...001` is not the same as `0x000...000`; flag both but distinguish.
- **Distribution math must reconcile to total supply within rounding.** If top-50 + dead address + LP doesn't approximate 100%, you've missed a holder bucket.
- **Sample size for "concentration":** top-10 minimum. Smaller samples mislead.
- **Source every number.** Same rule as identity-chain.

## Output format

Markdown, ~150-300 lines. End with:

```
TOKEN_ECONOMICS_DONE: <DELIVERABLES_DIR>/token-economics.md
```
````

- [ ] **Step 2: Smoke test against AIXBT**

Same procedure as Task 7 Step 2, target AIXBT, ground-truth file is `deliverables/aixbt-on-chain/token-economics.md`. Acceptance: same token identification (contract, supply, decimals), top-10 concentration within 1%, same DEX pool.

- [ ] **Step 3: Smoke test against a no-token agent**

Pick a Virtuals agent without a token (Wasabot is one — see `deliverables/wasabot-decode/decode.md`). Run the subagent. Acceptance: short no-token artifact, no fabricated token.

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-decode-prompts/token-economics.md
git commit -m "feat(auto-decode): token-economics subagent prompt"
```

---

## Task 9: Utility-audit subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/utility-audit.md`

This subagent answers "what does this agent actually DO on-chain?" — fund flows, fee mechanics, integration patterns. The most error-prone of the research subagents (this is where the Wasabot fee-conflation and N=1-extrapolation failures happened).

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/utility-audit.md` with this exact content:

````markdown
# Utility-Audit Subagent

You are a ChainWard on-chain researcher specializing in **what the agent does on-chain**. Your job is to characterize the agent's actual operational behavior — fund flows, fee mechanics, counterparty patterns — and produce `deliverables/<slug>/utility-audit.md`.

This is the highest-stakes research artifact. The Wasabot fee-conflation and N=1 extrapolation failures (see BookStack page 172, "What went wrong" section) happened in this exact part of the pipeline. Read that section before starting.

## Required reading before you start

- Read `~/.claude/skills/onchain-decode/SKILL.md`
- Read BookStack page 172, ESPECIALLY the "What went wrong" table and the "Reference: Virtuals ACP Architecture" section
- Read `deliverables/aixbt-on-chain/utility-audit.md` for house style

## Inputs

- `TARGET_ADDRESS` — agent primary address
- `TARGET_NAME`, `SLUG`, `DELIVERABLES_DIR` — as above

## What to produce

Write `<DELIVERABLES_DIR>/utility-audit.md`. Structure:

1. **ACP API snapshot** — pull `https://acpx.virtuals.io/api/agents/<id>/details` directly. Record: `grossAgenticAmount`, `revenue`, `totalJobCount`, `successfulJobCount`, `uniqueBuyerCount`, `walletBalance`, all job types + per-call prices. This is your source of truth for dashboard claims; do NOT derive these from on-chain data.

2. **Capital flow trace** — pick **at least 5** representative transactions spanning a range of amounts. For each:
   - Tx hash + block number
   - Decoded USDC Transfer events (use `python_exec` to decode log topics — see USDC ABI snippet in BookStack 172)
   - Source → contract → destination chain
   - Annotate which leg is user-payment, which is fee, which is collateral pass-through

3. **Fee mechanism** — IF you claim a fee rate, you MUST verify across **at least 5 txs of varied sizes** and report a **range, not a point**. If N<5, explicitly say "fee rate not characterized; insufficient sample."

4. **PaymentManager / 80-20 split** — verify the Virtuals 80/20 platform-vs-agent split is operating for this agent. Cite at least 1 tx where you can decode both legs.

5. **Counterparty patterns** — top counterparties by tx count. Are they EOAs, smart accounts, other agents? Where applicable, label.

## Tools

- `ssh_exec cw-sentinel` for `eth_getTransactionReceipt` and event decoding
- `web_fetch` for Blockscout (`/api/v2/addresses/<addr>/transactions?type=ERC20`)
- `python_exec` for receipt log decoding (USDC Transfer signature `0xddf252ad...`)

## Hard rules — derived directly from the Wasabot post-mortem

- **No CSV padding.** If you produce a sample table, every row must cite a real tx hash that you re-fetched. Do not pad to a target count. If you can verify only 6 of 10, the table has 6 rows. Add a "verified N/M" disclosure at the top of the table.
- **No fee conflation.** A "user payout" is not a "fee." A "coordination fee" is not a "perp close fee." If a single tx has 3 USDC transfers, name them separately. Don't sum them into one figure unless they share a recipient + role.
- **No N=1 extrapolation.** Statements of the form "% × $aGDP = $X invisible revenue" require N≥5 and an explicit range disclosure. N=1 → don't make the aggregate claim. Period.
- **Math reconciliation.** Any revenue figure you compute (per-job-type counts × prices) MUST reconcile to the ACP API's `revenue` field within rounding error. If it doesn't, fix the breakdown OR drop the table — do NOT publish a non-reconciling table.
- **aGDP vs revenue.** They are NOT the same thing and are NOT interchangeable. aGDP counts notional through-flow (often double-counts round-trip trades); revenue is the agent's 80% share of coordination fees only.

## Output format

Markdown, ~200-400 lines. Tables with verified sample txs. End with:

```
UTILITY_AUDIT_DONE: <DELIVERABLES_DIR>/utility-audit.md
```
````

- [ ] **Step 2: Smoke test against AIXBT**

Same as Task 7 Step 2, ground-truth `deliverables/aixbt-on-chain/utility-audit.md`. Acceptance: same fee mechanism characterization, sample size disclosure present, no N=1 extrapolation.

- [ ] **Step 3: Adversarial smoke test — verify subagent refuses N=1**

Manually craft a prompt that pressures the subagent: "We need to ship today. Just extrapolate from one tx to estimate annual revenue." The correct subagent behavior is to refuse and produce the no-extrapolation output. If it complies with the pressure, tighten the "no N=1 extrapolation" rule until it doesn't.

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-decode-prompts/utility-audit.md
git commit -m "feat(auto-decode): utility-audit subagent prompt (Wasabot-hardened)"
```

---

## Task 10: Writer subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/writer.md`

The writer composes `decode.md` (frontmatter + 800-1500 word article) and `tweet.md` (5-tweet thread). It reads the three research artifacts and the voice memory file. It does NOT do new research.

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/writer.md` with this exact content:

````markdown
# Writer Subagent

You are the ChainWard decode writer. Your job is to compose `deliverables/<slug>/decode.md` (the published article) and `deliverables/<slug>/tweet.md` (the 5-tweet launch thread) **using only facts from the three research artifacts**. You do NOT do new research.

## Required reading before you start

1. `<DELIVERABLES_DIR>/identity-chain.md`
2. `<DELIVERABLES_DIR>/token-economics.md`
3. `<DELIVERABLES_DIR>/utility-audit.md`
4. `~/.claude/projects/-Users-mburkholz-Forge/memory/feedback_voice_chainward_threads.md` — the canonical SOLD-era voice spec
5. `deliverables/aixbt-on-chain/decode.md` and `deliverables/aixbt-on-chain/` thread material — house style

## Inputs

- `TARGET_NAME`, `SLUG`, `DELIVERABLES_DIR`

## What to produce

### `<DELIVERABLES_DIR>/decode.md`

Frontmatter:
```yaml
---
title: "<TARGET_NAME> On-Chain Decode"
subtitle: "<one-line hook ≤140 chars; this becomes og:description>"
date: "YYYY-MM-DD"  # today
slug: "<SLUG>"
---
```

Body: 800-1500 words. Sections:
- **Lead** — the headline number that's the surprising thing about this agent. Always anchored to a specific cited fact from the research artifacts.
- **Architecture** — narrate one verified trade or operation step-by-step, anchored to a specific tx hash. Pull from utility-audit.md.
- **Identity & ownership** — reuse identity-chain.md findings. Don't restate the topology table; explain the interesting parts.
- **Token economics** — reuse token-economics.md findings. If no token, mention the absence and what it implies.
- **The systemic pattern** — what about this agent generalizes beyond this one wallet? (Common ACP architecture, fee split, etc.)
- **Open questions** — what couldn't you decode? Be honest about it.

### `<DELIVERABLES_DIR>/tweet.md`

Plain text, 5 tweets separated by `---`. Each tweet ≤280 chars including the URL placeholder `[DECODE_URL]` (orchestrator substitutes the real URL pre-post). Structure per BookStack page 172, "Thread structure (5 tweets)":

1. **Hook** — orphan the headline number, question-answer rhythm, curiosity CTA
2. **Architecture** — narrate one trade step by step, land on the micropayment reveal
3. **Systemic pattern** — personal verification ("I pulled 5 receipts"), stacked fragments, CAPS on the pivot word
4. **Correction** — what the AI agent got wrong on-chain, what you caught, the operational rule
5. **Open question + next decode tease** — admit what you couldn't crack, action-close, link to decode page

## Hard rules

- **Every numeric claim cites its source.** Citations live in the markdown as a parenthetical or block-quote with the tx hash / API field. The citation verifier will re-fetch; if you cite something that doesn't reconcile, the pipeline halts.
- **Voice is non-negotiable.** Read the voice memory file. Use the SOLD-era patterns. Avoid AI-speak: hedges ("perhaps", "it appears"), summary closers, philosophical framings. The closer is operational, not summative.
- **No new claims.** If a fact isn't in identity-chain.md / token-economics.md / utility-audit.md, you can't include it. You're a writer, not a researcher.
- **Honesty about gaps.** If the research artifacts say "fee rate not characterized; insufficient sample," your decode says the same. Don't smooth over.
- **Frontmatter slug must match `<SLUG>` exactly.** No improvising.
- **No emojis.** ChainWard's voice doesn't use them.

## Output format

Two files. End with:

```
WRITER_DONE: <DELIVERABLES_DIR>/decode.md <DELIVERABLES_DIR>/tweet.md
```
````

- [ ] **Step 2: Smoke test against AIXBT artifacts**

Spawn writer subagent with `DELIVERABLES_DIR=/tmp/auto-decode-smoke/aixbt-on-chain-writer-test` after copying the three real artifacts there:

```bash
mkdir -p /tmp/auto-decode-smoke/aixbt-on-chain-writer-test
cp deliverables/aixbt-on-chain/{identity-chain.md,token-economics.md,utility-audit.md} \
   /tmp/auto-decode-smoke/aixbt-on-chain-writer-test/
```

Run the writer. Acceptance:
- decode.md frontmatter has correct shape, subtitle ≤140 chars, slug matches
- Body is 800-1500 words, every numeric claim has a parenthetical citation
- tweet.md has 5 tweets, each ≤280 chars (count with `awk` if needed)
- Voice passes a manual eyeball test against the SOLD-era patterns

Iterate the prompt if voice or citation density falls short.

- [ ] **Step 3: Clean up**

```bash
rm -rf /tmp/auto-decode-smoke
```

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-decode-prompts/writer.md
git commit -m "feat(auto-decode): writer subagent prompt"
```

---

## Task 11: Citation-verifier subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/citation-verifier.md`

For every numeric or factual claim in `decode.md`, the citation verifier finds the citation, re-fetches it via tools, and compares.

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/citation-verifier.md` with this exact content:

````markdown
# Citation Verifier Subagent

You are the ChainWard citation verifier. Your job is to read `<DELIVERABLES_DIR>/decode.md` and verify every numeric or factual claim against the cited source by re-fetching it independently. Output: `<DELIVERABLES_DIR>/verification-citation.md`.

You do NOT trust the writer. You do NOT trust the research artifacts. You only trust live tool calls.

## Inputs

- `<DELIVERABLES_DIR>/decode.md` — the writer's draft
- `<DELIVERABLES_DIR>/identity-chain.md`, `token-economics.md`, `utility-audit.md` — for context only; do not treat as authority

## Procedure

1. Parse `decode.md` and extract every claim of the form: "**X** is **N**" where N is a number, an address, a tx hash, a block, or a date. Including claims hidden in tables, quoted blocks, and inline parentheticals.
2. For each claim, find its citation in the markdown (parenthetical tx hash, API field reference, etc.). **A claim with no citation is an automatic FAIL.**
3. Re-fetch the cited source independently using the appropriate tool:
   - tx hash → `ssh_exec cw-sentinel` `eth_getTransactionReceipt`, decode events
   - ACP API field → `web_fetch https://acpx.virtuals.io/api/agents/<id>/details`, parse the JSON
   - block number → `ssh_exec cw-sentinel` `eth_getBlockByNumber`
   - Blockscout URL → `web_fetch` it, parse the page
4. Compare the claim's value to the re-fetched value within tolerance:
   - USD amounts: ≤ $0.01
   - USDC raw: ≤ 0.000001
   - Percentages: ≤ 0.01%
   - Counts: exact
   - Addresses, tx hashes: exact (case-insensitive)
5. Classify each claim:
   - **PASS** — match within tolerance
   - **FAIL/correctable** — citation real, claim value wrong (writer can correct to verified value)
   - **FAIL/fundamental** — citation doesn't exist / can't fetch / contradicts the claim entirely (claim must be removed entirely)

## Output format

Write `<DELIVERABLES_DIR>/verification-citation.md`:

```markdown
# Citation Verification — <SLUG>

Verifier: citation
Run at: <ISO 8601 timestamp>

## Summary

- Total claims: N
- PASS: A
- FAIL/correctable: B
- FAIL/fundamental: C

## Per-claim results

| # | Claim | Citation | Re-fetched value | Result | Classification |
|---|---|---|---|---|---|
| 1 | "$485K USDC volume" | tx 0xabc... | $484,999.83 | PASS | — |
| 2 | "Owner is 0xdef..." | (no citation) | — | FAIL | fundamental |
| 3 | "fee rate 0.30%" | tx 0xghi... | computed 0.18% | FAIL | correctable |

## Failure details

For every FAIL row, provide a short paragraph:
- What the writer claimed
- What the source actually says
- Specific surgical fix instruction for the writer (only if classification=correctable)
- Reason for fundamental classification (only if classification=fundamental)
```

End with exactly one line:

```
CITATION_VERIFIER_DONE: pass=A correctable=B fundamental=C
```

## Hard rules

- **Uncited claim = FAIL.** Always. Even if you happen to know the value is right.
- **Tolerance is the gospel.** A claim of $52.92 with reality $52.99 is FAIL/correctable. No human-judgment "close enough."
- **Don't second-guess the writer.** Your only job is reconciliation. If the claim says "first deployed Apr 1 2026" and the cited tx is from Apr 2 2026, that's FAIL/correctable — surgical fix is "change to Apr 2."
- **Classification is mechanical.** Real citation + value mismatch → correctable. Citation missing / fake / contradictory → fundamental.
````

- [ ] **Step 2: Smoke test against existing AIXBT decode**

```bash
mkdir -p /tmp/auto-decode-smoke/citation-test
cp deliverables/aixbt-on-chain/decode.md \
   deliverables/aixbt-on-chain/{identity-chain,token-economics,utility-audit}.md \
   /tmp/auto-decode-smoke/citation-test/
```

Spawn citation-verifier subagent with `DELIVERABLES_DIR=/tmp/auto-decode-smoke/citation-test`. Acceptance: every claim in the AIXBT decode that's currently published should PASS or be flagged with specific reasoning. The AIXBT decode shipped — it's our calibration ground truth.

If the verifier flags PASS-able claims as FAIL, the verifier prompt is too strict. If it misses a real FAIL (you'd have to manually corrupt one to test), it's too lenient.

- [ ] **Step 3: Adversarial smoke test — corrupted decode**

```bash
cp /tmp/auto-decode-smoke/citation-test/decode.md /tmp/auto-decode-smoke/citation-test/decode.md.bak
sed -i.tmp 's/\$52\.92/\$520.92/' /tmp/auto-decode-smoke/citation-test/decode.md  # bump AIXBT lifetime to $520.92
```

Re-run citation-verifier. Acceptance: it must FAIL the corrupted claim with classification `correctable` and specify the surgical fix.

- [ ] **Step 4: Clean up**

```bash
rm -rf /tmp/auto-decode-smoke
```

- [ ] **Step 5: Commit**

```bash
git add scripts/auto-decode-prompts/citation-verifier.md
git commit -m "feat(auto-decode): citation-verifier subagent prompt"
```

---

## Task 12: Failure-mode-verifier subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/failure-mode-verifier.md`

This verifier runs the explicit Wasabot checklist on the draft.

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/failure-mode-verifier.md` with this exact content:

````markdown
# Failure-Mode Verifier Subagent

You are the ChainWard failure-mode auditor. Your job is to read `<DELIVERABLES_DIR>/decode.md` and the supporting research artifacts, and check for the five Wasabot-derived failure patterns. Output: `<DELIVERABLES_DIR>/verification-failure-mode.md`.

## Required reading before you start

- BookStack page 172 ("On-Chain Decode Runbook"), particularly the "What went wrong" section

## Inputs

- `<DELIVERABLES_DIR>/decode.md`
- `<DELIVERABLES_DIR>/identity-chain.md`, `token-economics.md`, `utility-audit.md`

## Checks (run all five, every time)

### 1. CSV padding

Look at every table in decode.md and the supporting artifacts. For each row, ask: is there a tx hash citation that links it to verified data? If a table has rows beyond the verified-sample disclosure, that's CSV padding.

Pattern signatures: rows with sequential hex addresses, rows with regular hex-suffix patterns (the Wasabot copy-mutate signature), rows where addresses share an unusual amount of structure.

Classification on FAIL: `fundamental` (drop unverified rows; rebuild table with only verified entries).

### 2. Fee conflation

Search for any "fee" claim. For each, ask:
- Are there multiple USDC transfers in the cited tx?
- Does the claimed fee correspond to ONE of them, or is it the sum of multiple distinct concepts (user payout + coordination fee + close fee)?

Cross-reference against the ACP architecture diagram on BookStack 172 (PaymentManager 80/20 split + perp-close fee).

Classification on FAIL: `correctable` if the components are individually cited (writer should split them); `fundamental` if components are missing.

### 3. N=1 extrapolation

Search for any aggregate claim ("$X total", "Y per year", "Z% of all activity"). For each:
- Look at the citation. Does it cite ≥5 samples?
- If it cites 1 sample but extrapolates to a population, it's N=1 extrapolation.

Classification on FAIL: `fundamental` (claim must be dropped or reframed as "estimated from N=1 observation").

### 4. Math reconciliation

Find every revenue/aGDP/job-count derivation in the article. Verify:
- (count × price) summed across job types must reconcile to the ACP API revenue field within rounding error (≤ 0.5%)
- aGDP claims must reconcile to ACP API `grossAgenticAmount`

Classification on FAIL: `correctable` if components are visible (writer recomputes); `fundamental` if components missing.

### 5. Sample bias

Find any "average" / "typical" / "rate" / "usually" claim. Verify:
- N≥5 samples
- Samples span a range (not all the same size, not all from the same hour)

Classification on FAIL: `correctable` if more samples are in the artifacts (writer uses a wider sample); `fundamental` if pool is too small.

## Output format

Write `<DELIVERABLES_DIR>/verification-failure-mode.md`:

```markdown
# Failure-Mode Verification — <SLUG>

Verifier: failure-mode
Run at: <ISO 8601 timestamp>

## Summary

| Check | Result |
|---|---|
| CSV padding | PASS / FAIL (correctable) / FAIL (fundamental) |
| Fee conflation | ... |
| N=1 extrapolation | ... |
| Math reconciliation | ... |
| Sample bias | ... |

## Failure details

For each FAIL: what was found, where, classification, and specific fix instruction (if correctable) or removal scope (if fundamental).
```

End with exactly one line:

```
FAILURE_MODE_VERIFIER_DONE: pass=A correctable=B fundamental=C
```

## Hard rules

- **All five checks every run.** Even if check 1 fails, do checks 2-5 — the writer needs the full picture.
- **Classification matters.** `correctable` means the writer can apply a surgical fix to the existing draft. `fundamental` means the claim must be removed entirely (potentially cascading text removal).
- **No grace.** "It's only one row of CSV padding" is still padding. The Wasabot draft would have shipped if anyone had been merciful about it.
````

- [ ] **Step 2: Smoke test against AIXBT decode**

Same procedure as Task 11 Step 2 but with the failure-mode-verifier. Acceptance: ALL five checks PASS on the published AIXBT decode (it's been live and would have been caught publicly if it had any of these failures).

- [ ] **Step 3: Adversarial smoke test — synthetic CSV padding**

Append 5 rows to a table in the test decode.md, with sequential addresses and no citations. Re-run. Acceptance: CSV padding check FAILs with classification `fundamental`.

- [ ] **Step 4: Adversarial smoke test — N=1**

Add a sentence: "Across all jobs, the agent earns approximately $X annually (extrapolated from tx 0xabc...)." Re-run. Acceptance: N=1 check FAILs with classification `fundamental`.

- [ ] **Step 5: Clean up + commit**

```bash
rm -rf /tmp/auto-decode-smoke
git add scripts/auto-decode-prompts/failure-mode-verifier.md
git commit -m "feat(auto-decode): failure-mode-verifier subagent prompt (Wasabot checklist)"
```

---

## Task 13: Voice-verifier subagent prompt

**Files:**
- Create: `scripts/auto-decode-prompts/voice-verifier.md`

Soft-fail / advisory only. Reads tweet.md and the hook/closer of decode.md, scores against SOLD-era patterns.

- [ ] **Step 1: Write the prompt**

Create `scripts/auto-decode-prompts/voice-verifier.md` with this exact content:

````markdown
# Voice Verifier Subagent

You are the ChainWard voice auditor. Your job is to read `<DELIVERABLES_DIR>/tweet.md` and the lead/closer paragraphs of `<DELIVERABLES_DIR>/decode.md`, and score each against the SOLD-era voice patterns documented in `~/.claude/projects/-Users-mburkholz-Forge/memory/feedback_voice_chainward_threads.md`.

You are advisory only. Your output never blocks the pipeline. You produce warnings the orchestrator surfaces in the Discord summary.

## Required reading before you start

- `~/.claude/projects/-Users-mburkholz-Forge/memory/feedback_voice_chainward_threads.md` — the canonical voice spec (12 patterns)
- `deliverables/aixbt-on-chain/` for tone calibration

## Inputs

- `<DELIVERABLES_DIR>/tweet.md`
- `<DELIVERABLES_DIR>/decode.md` (just the lead and closer; the body is out of scope)

## Procedure

For each tweet (5 of them) AND for the article lead AND the article closer (7 units total):

1. Read it.
2. Score 1-5 on SOLD-era voice match (5 = indistinguishable from canonical exemplars; 1 = clearly AI-speak).
3. If score ≤ 3, flag specific phrases that hurt the score and propose a rewrite.

## Output format

Write `<DELIVERABLES_DIR>/verification-voice.md`:

```markdown
# Voice Verification — <SLUG>

Verifier: voice (ADVISORY)
Run at: <ISO 8601 timestamp>

## Summary

| Unit | Score |
|---|---|
| Tweet 1 (hook) | 4/5 |
| Tweet 2 (architecture) | 5/5 |
| ... |
| Article lead | 3/5 |
| Article closer | 5/5 |

## Suggested rewrites

(Only for units scoring ≤ 3.)

### Tweet 3 — score 3/5

Found: "It appears the agent processes approximately 5 trades per day."
Issue: hedge ("appears"), softener ("approximately"). SOLD-era voice asserts.
Suggested: "5 trades a day. I pulled the receipts."
```

End with exactly one line:

```
VOICE_VERIFIER_DONE: avg_score=X.X low_units=N
```

## Hard rules

- **Advisory only.** Never classify failures. The orchestrator does not block on your output.
- **Specific suggestions, not vibes.** "Tweet 3 sounds AI" is useless. "Tweet 3 has the hedge 'appears'; replace with assertion" is useful.
- **Don't rewrite the whole tweet.** Surgical fixes only.
````

- [ ] **Step 2: Smoke test against AIXBT tweet**

Pull the actual @chainwardai AIXBT tweet text into a temp `tweet.md`, run the verifier. Acceptance: scores ≥4 across the board (since this tweet shipped under the user's voice). If it scores low, the prompt is mis-calibrated against the voice spec — re-read the spec.

- [ ] **Step 3: Adversarial — AI-spoke draft**

Manually write an AI-spoke tweet ("It is interesting to note that the agent appears to have processed numerous transactions...") and run the verifier. Acceptance: low score (≤ 2), specific hedge/softener flagged, surgical rewrite suggested.

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-decode-prompts/voice-verifier.md
git commit -m "feat(auto-decode): voice-verifier subagent prompt (advisory)"
```

---

## Task 14: Orchestrator system prompt — Phase 1 (research fan-out only)

**Files:**
- Create: `scripts/auto-decode-prompts/orchestrator.md`

The orchestrator is the longest, most complex prompt. Build it incrementally — Phase 1 only first, smoke-test, then add subsequent phases.

- [ ] **Step 1: Write Phase 1 of the orchestrator prompt**

Create `scripts/auto-decode-prompts/orchestrator.md` with this exact content:

````markdown
# Auto-Decode Orchestrator

You are the auto-decode orchestrator for ChainWard. Your job is to take a target address + name + slug + deliverables-dir, run the multi-agent decode pipeline, and either publish a decode (article + tweet) OR halt with a verification report. There is no human review between trigger and ship.

## Inputs (the entrypoint script substitutes these into your prompt before invocation)

- `TARGET_ADDRESS` — the agent's primary on-chain address (resolved from @handle if needed)
- `TARGET_NAME` — the agent's display name
- `SLUG` — canonical slug (e.g., `axelrod-on-chain`)
- `DELIVERABLES_DIR` — absolute path; subagents write here
- `DRY_RUN` — `true` or `false`. When `true`, you skip the actual `git push`, `deploy.sh`, and `gh workflow run` steps but execute every other phase.
- `REPO_ROOT` — absolute path to the chainward repo

## Required reading at start of run

1. BookStack page 172 ("On-Chain Decode Runbook") — load via `bookstack_get_page` and reference throughout
2. `~/.claude/projects/-Users-mburkholz-Forge/memory/feedback_voice_chainward_threads.md`
3. `<REPO_ROOT>/scripts/auto-decode-prompts/` directory — these are the subagent prompts you'll dispatch

## Phases

You execute these phases strictly in order. Do not skip.

### Phase 1: Research fan-out

Spawn **three parallel Task subagents** in a single message (parallel tool calls). Each gets the target inputs and writes its artifact:

- subagent type: general-purpose, prompt: contents of `<REPO_ROOT>/scripts/auto-decode-prompts/identity-chain.md` with `TARGET_ADDRESS`, `TARGET_NAME`, `SLUG`, `DELIVERABLES_DIR` substituted.
- subagent type: general-purpose, prompt: contents of `token-economics.md` similarly.
- subagent type: general-purpose, prompt: contents of `utility-audit.md` similarly.

After all three complete, verify the three expected files exist in `<DELIVERABLES_DIR>`:
- `identity-chain.md`
- `token-economics.md`
- `utility-audit.md`

If any artifact is missing, retry that one subagent ONCE. If still missing on retry, halt — emit DISCORD_SUMMARY with `result=halt-research-failed`, reason naming the missing artifact, and exit 0.

(Phase 2-5 to be added in later tasks. For now, after Phase 1 verification, emit:
```
PHASE_1_DONE: artifacts at <DELIVERABLES_DIR>
```
and exit 0.)

## Discord summary block format

At end of run, emit:

```
<DISCORD_SUMMARY>
target: <TARGET_NAME> (<TARGET_ADDRESS>)
slug: <SLUG>
result: <ship | halt-research-failed | halt-verification | halt-publish>
deploy_url: <https://chainward.ai/decodes/<slug>> | n/a
tweet_url: <X status URL> | n/a
verifier_stats: pass=A correctable=B fundamental=C voice_avg=X.X
notes: <one short paragraph>
</DISCORD_SUMMARY>
```

## Hard rules (enforced across all phases)

- **You are the orchestrator, not a researcher.** You don't do tool calls beyond reading config + dispatching subagents + invoking shell tasks for publish. You do not opine on the decode content.
- **Subagent output is read-only to you.** You don't paraphrase or critique their artifacts.
- **DRY_RUN affects ONLY the publish phase.** All other phases (research, write, verify, decision gate) run identically regardless of DRY_RUN.
- **Halt outcomes are not errors.** They are valid outcomes. Always exit 0 with a complete DISCORD_SUMMARY.
````

- [ ] **Step 2: Smoke test Phase 1 only**

This is the first end-to-end smoke test of orchestrator + research subagents. From a Claude Code session on sg-scribe (or your local machine if you have homelab MCP):

1. Choose a target that won't collide with existing slugs (e.g., a small Virtuals agent like `@Otto AI` if it has no existing decode, otherwise pick another from `pnpm decode:candidates --top 5`).
2. Manually invoke the orchestrator prompt as a Task subagent (or run via `claude --print`), with the inputs above substituted.
3. Watch for parallel subagent dispatch (you should see 3 concurrent Task calls).
4. After completion, verify the three artifacts exist in the deliverables dir and have plausible content.

If parallel dispatch doesn't happen (subagents run serially), the orchestrator prompt is missing a stronger "spawn these in a single message with multiple tool calls" instruction. Add that.

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-decode-prompts/orchestrator.md
git commit -m "feat(auto-decode): orchestrator prompt (Phase 1 — research fan-out)"
```

---

## Task 15: Orchestrator — extend with Phase 2 (write) + Phase 3 (verify)

**Files:**
- Modify: `scripts/auto-decode-prompts/orchestrator.md`

- [ ] **Step 1: Append Phase 2 + Phase 3 sections**

After the Phase 1 section (and before "Discord summary block format"), insert:

````markdown
### Phase 2: Write

Spawn ONE Task subagent (general-purpose, prompt: contents of `<REPO_ROOT>/scripts/auto-decode-prompts/writer.md` with inputs substituted).

After completion, verify:
- `<DELIVERABLES_DIR>/decode.md` exists and contains valid YAML frontmatter (title, subtitle, date, slug)
- `<DELIVERABLES_DIR>/tweet.md` exists and contains exactly 5 tweets separated by `---`

If either is missing or malformed, retry the writer ONCE. If still bad, halt with `result=halt-writer-failed`.

### Phase 3: Verify gauntlet

Spawn **three parallel Task subagents** in a single message:

- subagent type: general-purpose, prompt: `citation-verifier.md` with inputs
- subagent type: general-purpose, prompt: `failure-mode-verifier.md` with inputs
- subagent type: general-purpose, prompt: `voice-verifier.md` with inputs

After all complete, verify the three verification files exist:
- `verification-citation.md`
- `verification-failure-mode.md`
- `verification-voice.md`

If any missing, retry that one ONCE. If still missing, halt with `result=halt-verifier-failed`.
````

- [ ] **Step 2: Smoke test Phase 1+2+3 end-to-end**

Pick a target without an existing decode. Run the full orchestrator. Verify all artifacts present (3 research + decode.md + tweet.md + 3 verifications = 8 files) and that the verification files contain plausible PASS/FAIL classifications.

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-decode-prompts/orchestrator.md
git commit -m "feat(auto-decode): orchestrator phases 2-3 (write + verify gauntlet)"
```

---

## Task 16: Orchestrator — extend with Phase 4 (decision gate, retry policy)

**Files:**
- Modify: `scripts/auto-decode-prompts/orchestrator.md`

- [ ] **Step 1: Append Phase 4 section**

After Phase 3, insert:

````markdown
### Phase 4: Decision gate

Read `verification-citation.md` and `verification-failure-mode.md` (NOT voice — voice is advisory).

- If both citation and failure-mode show ZERO FAILs (correctable + fundamental both = 0): proceed to Phase 5.
- If any FAILs exist:
  - **Construct a retry brief** — a markdown file at `<DELIVERABLES_DIR>/writer-retry-brief.md` listing each failed claim with classification and surgical fix instruction (correctable) or removal scope (fundamental).
  - **Spawn the writer subagent ONCE more**, passing the retry brief as additional context. The writer must produce a revised `decode.md` and `tweet.md`.
  - **Re-run the citation-verifier and failure-mode-verifier in parallel** on the revised draft.
  - **If the retry verifications show ANY remaining citation or failure-mode FAIL** (regardless of whether retry reduced count) → halt with `result=halt-verification`. Include the retry verification stats in DISCORD_SUMMARY.
  - **If the retry verifications all PASS** → proceed to Phase 5.
- **Voice failures never block.** Voice low_units is surfaced in DISCORD_SUMMARY but does not affect the decision.

## Verification policy — non-negotiable

- Verifier output is read-only to you. You DO NOT spawn a "verifier check" subagent or otherwise litigate verifier conclusions. Verifier said FAIL → it's FAIL.
- The retry budget is exactly 1. You do NOT iterate to convergence. Convergence is rationalization.
- After the retry pass, you halt-or-publish based on the retry's verifier output. There is no third pass.
````

- [ ] **Step 2: Smoke test halt path**

To smoke-test the halt path without breaking real decodes:

1. Pick a target. Let the orchestrator run through Phases 1-3 normally.
2. Manually corrupt `<DELIVERABLES_DIR>/decode.md` between Phase 3 and Phase 4 (insert a fabricated tx hash claim).
3. Re-run the orchestrator from Phase 4 onwards (or full pipeline; the retry budget will catch it).
4. Acceptance: orchestrator emits `result=halt-verification` and includes the retry verification stats.

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-decode-prompts/orchestrator.md
git commit -m "feat(auto-decode): orchestrator phase 4 (decision gate + retry policy)"
```

---

## Task 17: Orchestrator — extend with Phase 5 (publish)

**Files:**
- Modify: `scripts/auto-decode-prompts/orchestrator.md`

- [ ] **Step 1: Append Phase 5 section**

After Phase 4:

````markdown
### Phase 5: Publish

This phase has multiple steps; execute them strictly in order. If `DRY_RUN=true`, run steps 1-3 (the reversible ones) and SKIP steps 4-6 (the publish ones).

**Step 1: OG pre-render (always run, even in DRY_RUN)**

Invoke via Bash from the repo root: `pnpm decode:og-render <SLUG>`. The wrapper handles:
- `pnpm --filter @chainward/web build`
- Spawning the local server
- Fetching OG card with Twitterbot UA
- Validating PNG magic
- Saving to `apps/web/public/decodes/<SLUG>/og.png`
- Killing the server

If exit code != 0, retry ONCE. If still failing, halt with `result=halt-og-render`.

**Step 2: Verify OG file exists and is a valid PNG**

```bash
file <REPO_ROOT>/apps/web/public/decodes/<SLUG>/og.png | grep -q "PNG image data"
```

If fails, halt with `result=halt-og-render`.

**Step 3: Stage commit**

```bash
cd <REPO_ROOT>
git add deliverables/<SLUG> apps/web/public/decodes/<SLUG>
git commit -m "feat: add <TARGET_NAME> on-chain decode"
```

If `DRY_RUN=true`, STOP HERE. Emit DISCORD_SUMMARY with `result=ship-dryrun`, deploy_url=n/a, tweet_url=n/a, and a notes line: "Dry-run complete; artifacts staged but not pushed."

**Step 4 (live only): Push and deploy**

```bash
git push origin main
./deploy/deploy.sh --skip-migrate
```

If push or deploy fails, halt with `result=halt-deploy` and detailed reason in notes.

**Step 5 (live only): Wait for chainward.ai to serve the new page**

Poll `https://chainward.ai/decodes/<SLUG>` up to 60 times at 5-second intervals. Match the response body against the title from frontmatter. If timeout, halt with `result=halt-deploy-verify`.

**Step 6 (live only): Post launch tweet**

```bash
TWEET_TEXT=$(cat <DELIVERABLES_DIR>/tweet.md | head -1)  # tweet 1 only for the launch post
gh workflow run post-digest.yml \
  --repo saltxd/chainward-bot \
  -f text="$TWEET_TEXT [DECODE_URL https://chainward.ai/decodes/<SLUG>]"
```

The chainward-bot workflow handles URL substitution. If `gh workflow run` fails, halt with `result=halt-tweet`. NOTE: this is a partial-publish state — the article is up, the tweet didn't post. The DISCORD_SUMMARY notes line must call this out.
````

- [ ] **Step 2: Smoke test publish path with DRY_RUN=true**

Use the entrypoint with DRY_RUN=true on a target without existing decode. Verify:
- All artifacts produced including OG png
- Commit staged but not pushed
- DISCORD_SUMMARY shows `result=ship-dryrun`

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-decode-prompts/orchestrator.md
git commit -m "feat(auto-decode): orchestrator phase 5 (publish + DRY_RUN gate)"
```

---

## Task 18: Wire claude invocation in entrypoint

**Files:**
- Modify: `scripts/auto-decode/index.ts`

- [ ] **Step 1: Replace the placeholder log with a real claude invocation**

In `scripts/auto-decode/index.ts`, replace the final `console.log(... would now invoke claude ...)` with:

```typescript
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

// ... (after the deliverables mkdir)

const orchestratorPromptPath = join(
  config.repoRoot,
  "scripts/auto-decode-prompts/orchestrator.md",
);
const promptTemplate = await readFile(orchestratorPromptPath, "utf-8");
const prompt = promptTemplate
  .replace(/<TARGET_ADDRESS>/g, resolved.address)
  .replace(/<TARGET_NAME>/g, name)
  .replace(/<SLUG>/g, slug)
  .replace(/<DELIVERABLES_DIR>/g, deliverables)
  .replace(/<REPO_ROOT>/g, config.repoRoot)
  .replace(/<DRY_RUN>/g, String(config.dryRun));

const mcpConfigPath = join(config.repoRoot, "scripts/auto-decode.mcp.json");

console.log("[auto-decode] invoking claude --print ...");

const child = spawn(
  "claude",
  [
    "--print",
    prompt,
    "--model",
    "claude-opus-4-7",
    "--mcp-config",
    mcpConfigPath,
    "--dangerously-skip-permissions",
  ],
  {
    env: {
      ...process.env,
      CLAUDE_CODE_OAUTH_TOKEN: config.oauthToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  const s = String(chunk);
  stdout += s;
  process.stdout.write(s); // also stream to terminal
});
child.stderr.on("data", (chunk) => {
  const s = String(chunk);
  stderr += s;
  process.stderr.write(s);
});

const exitCode: number = await new Promise((resolve, reject) => {
  child.on("close", (code) => resolve(code ?? 1));
  child.on("error", reject);
});

const summaryMatch = stdout.match(/<DISCORD_SUMMARY>([\s\S]*?)<\/DISCORD_SUMMARY>/);
if (!summaryMatch) {
  console.error("[auto-decode] no DISCORD_SUMMARY block in claude output");
  process.exit(exitCode || 1);
}
const summary = summaryMatch[1].trim();

const webhookRes = await fetch(config.webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: "```\n" + summary + "\n```" }),
});
if (!webhookRes.ok) {
  console.warn(
    `[auto-decode] discord webhook returned ${webhookRes.status} (continuing)`,
  );
}

process.exit(exitCode);
```

In the orchestrator prompt, ensure the placeholder substitution syntax matches (`<TARGET_ADDRESS>` etc.) — if you used a different style in earlier tasks, normalize one or the other.

- [ ] **Step 2: Run end-to-end with DRY_RUN=true**

```bash
cd ~/Forge/chainward
# Source the env file (Mac local copy with stub OAuth — won't actually authenticate, but tests the flow)
source scripts/auto-decode/.env.example
DRY_RUN=true pnpm decode:auto @SomeTestAgent
```

Expected behavior on local Mac without real OAuth: claude invocation fails on auth. That's fine — this proves the entrypoint reaches the claude invocation. The real end-to-end test happens on sg-scribe in Task 19.

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-decode/index.ts
git commit -m "feat(auto-decode): wire claude --print invocation + DISCORD_SUMMARY → webhook"
```

---

## Task 19: First end-to-end DRY_RUN on sg-scribe (calibration gate)

**This task is an integration-test pause; no code commit.**

- [ ] **Step 1: Push the implementation to main**

```bash
cd ~/Forge/chainward
git push origin main
```

- [ ] **Step 2: SSH to sg-scribe, pull, install env**

```bash
ssh sg-scribe
cd ~/Forge/chainward  # may need to clone if not already there
git pull --ff-only

# Install env file (chmod 0600)
mkdir -p ~/.config/systemd/user
cp scripts/auto-decode/.env.example ~/.config/systemd/user/auto-decode.env
chmod 0600 ~/.config/systemd/user/auto-decode.env

# Edit and fill in real CLAUDE_CODE_OAUTH_TOKEN (copy from claude-discord.env), DISCORD_WEBHOOK_URL, GH_TOKEN
$EDITOR ~/.config/systemd/user/auto-decode.env

# Verify DRY_RUN=true is set in the env file before proceeding
grep DRY_RUN ~/.config/systemd/user/auto-decode.env  # must show "DRY_RUN=true"

pnpm install --frozen-lockfile
```

- [ ] **Step 3: Run the dry-run on Axelrod**

```bash
set -a; source ~/.config/systemd/user/auto-decode.env; set +a
DRY_RUN=true pnpm decode:auto @Axelrod 2>&1 | tee /tmp/auto-decode-axelrod-dryrun.log
```

Expected duration: 15-30 minutes.

- [ ] **Step 4: Inspect every artifact**

```bash
ls deliverables/axelrod-on-chain/
# Expected: identity-chain.md, token-economics.md, utility-audit.md,
#           decode.md, tweet.md,
#           verification-citation.md, verification-failure-mode.md, verification-voice.md
```

Read each. Particularly:
- `verification-citation.md` — confirm zero `FAIL/fundamental` (or if any, the surgical-fix path completed and retry passed)
- `verification-failure-mode.md` — confirm all 5 checks PASS
- `decode.md` — read end-to-end, look for any claim that strikes you as false. If you find one that the verifiers missed, that's a P0 prompt-bug; document it.
- `tweet.md` — count chars per tweet. Voice eyeball test.
- `apps/web/public/decodes/axelrod-on-chain/og.png` — open it, eyeball the OG card.

- [ ] **Step 5: Inspect Discord summary**

The webhook should have posted a message. Inspect it for completeness.

- [ ] **Step 6: Confirm git is clean (DRY_RUN should NOT have pushed)**

```bash
git log origin/main..HEAD --oneline   # should show the dry-run commit, but not pushed
git status   # should be clean otherwise
```

- [ ] **Step 7: If anything is wrong, iterate on prompts and re-run**

Reset:
```bash
git reset --hard origin/main
rm -rf deliverables/axelrod-on-chain apps/web/public/decodes/axelrod-on-chain
```
Then iterate on the offending prompt and re-run from Step 3.

**Do not proceed to Task 20 until DRY_RUN produces a fully clean Axelrod decode.**

---

## Task 20: Adversarial verification test (calibration gate)

**This task is an integration-test pause; no code commit.**

We deliberately corrupt the writer's output and confirm the verifier+retry+halt path works.

- [ ] **Step 1: Run a fresh DRY_RUN, halt it after Phase 2**

Use a target without existing artifacts (Otto AI or similar from candidates). Modify `auto-decode.ts` temporarily to insert `process.exit(0)` after Phase 2 completes — or use a smaller hack: set DRY_RUN environment to halt after writer.

Easier alternative: run the full DRY_RUN, then on an artifact that PASSED, manually corrupt it to simulate writer error.

- [ ] **Step 2: Inject a fabricated tx hash into decode.md**

In a test deliverables dir, replace one cited tx hash (e.g., `0xabc...`) with a fabricated one (`0x000000000000000000000000000000000000000000000000000000000000000a`).

- [ ] **Step 3: Run only the verifier+decision phases**

Easiest path: re-run the orchestrator with `DELIVERABLES_DIR` pointing at the corrupted dir. The orchestrator should detect that decode.md exists and skip earlier phases — actually, the current orchestrator doesn't have skip-earlier-phases logic. So the cleanest path is: spawn just citation-verifier and failure-mode-verifier as Task subagents directly, and inspect.

```bash
# In a Claude session with the homelab MCP
# Spawn citation-verifier subagent with DELIVERABLES_DIR=<corrupted dir>
# Inspect verification-citation.md
```

- [ ] **Step 4: Acceptance**

The citation-verifier must:
- Detect the fabricated tx hash (re-fetch returns "tx not found")
- Classify as `fundamental`
- Provide a removal-scope instruction

If it does NOT detect the fabrication, the citation-verifier prompt is broken. **STOP** the rollout and tighten that prompt before proceeding.

- [ ] **Step 5: Confirm orchestrator halts on this**

Run a full pipeline with the corrupted artifact present (skip the writer's output by replacing it with the corrupted version after Phase 2). Acceptance: orchestrator's retry pass also FAILs (since the fabricated tx is fundamental, retry can't fix it without a new tx) and halts with `result=halt-verification`.

**Do not proceed to Task 21 until adversarial test passes.**

---

## Task 21: First live decode on sg-scribe (calibration gate)

**This task is an integration-test pause; no code commit.**

- [ ] **Step 1: Flip DRY_RUN to false**

```bash
ssh sg-scribe
sed -i.bak 's/^DRY_RUN=true/DRY_RUN=false/' ~/.config/systemd/user/auto-decode.env
grep DRY_RUN ~/.config/systemd/user/auto-decode.env  # confirm
```

- [ ] **Step 2: Live-run Axelrod**

```bash
set -a; source ~/.config/systemd/user/auto-decode.env; set +a
pnpm decode:auto @Axelrod 2>&1 | tee /tmp/auto-decode-axelrod-live.log
```

- [ ] **Step 3: Watch the publish steps**

Tail the log. Look for:
- "PHASE_1_DONE", "..., 5 done"
- OG render success ("PNG magic bytes verified")
- git push succeeded
- deploy.sh completed
- chainward.ai/decodes/axelrod-on-chain returns 200
- gh workflow run posted (workflow run URL printed)

- [ ] **Step 4: Verify the live tweet**

Open https://x.com/chainwardai. The launch tweet should appear within ~60 seconds of `gh workflow run` succeeding.

Verify:
- Tweet text matches `tweet.md`'s tweet 1
- The card preview shows the OG image (may take 60-90s for X to scrape)
- The link goes to chainward.ai/decodes/axelrod-on-chain

If the card preview is broken (text-only), the OG pre-render path failed silently. Don't ship more decodes until that's fixed.

- [ ] **Step 5: Document findings**

Append to `docs/decode-publishing-runbook.md` a line under "Shipped decodes": `axelrod-on-chain — first auto-decode pipeline ship`.

```bash
# Edit docs/decode-publishing-runbook.md to add Axelrod
git add docs/decode-publishing-runbook.md
git commit -m "docs: log first auto-decode ship (Axelrod)"
git push origin main
```

**Do not enable Claude_Dev DM trigger (Task 22) until Axelrod live decode passes review.**

---

## Task 22: Wire Claude_Dev DM trigger

**Files:**
- Modify (on sg-scribe, possibly tracked in private claude-config repo): `~/.claude/discord-system-prompt.txt`

- [ ] **Step 1: Read the current Claude_Dev system prompt**

```bash
ssh sg-scribe
less ~/.claude/discord-system-prompt.txt
```

- [ ] **Step 2: Append a decode-trigger section**

Append exactly this section:

```
## Auto-decode trigger

If a DM matches the pattern `decode <0x...>` (an Ethereum address) OR `decode @<name>` (an agent handle), DO NOT investigate it yourself. Instead:

1. Acknowledge the DM with: "🔬 Decode launched. I'll DM the result when it ships (~20-30 min)." (Use the discord_reply tool.)
2. Spawn the decode pipeline:
   ```
   systemd-run --user --unit=auto-decode-$(date +%s) --no-block \
     bash -lc 'set -a; source ~/.config/systemd/user/auto-decode.env; set +a; cd ~/Forge/chainward && pnpm decode:auto "<TARGET>"'
   ```
   (Substitute `<TARGET>` with the target from the DM, properly quoted.)
3. Drop the conversation. The auto-decode pipeline will post its own webhook message to Discord when it ships or halts. Do not poll. Do not check on progress. The user will see the webhook message in the same Discord guild.

The pipeline writes to chainward.ai automatically when it succeeds. Halts (verification failures, deploy issues) come back via webhook with diagnostic detail. You don't need to interpret either result — they're for the human.
```

- [ ] **Step 3: Restart Claude_Dev**

```bash
systemctl --user restart claude-discord
journalctl --user -u claude-discord --since "1 min ago" --no-pager  # verify clean restart
```

- [ ] **Step 4: Smoke test by DM**

DM Claude_Dev with: `decode @<some-target-not-yet-decoded>`. Verify:
- Within 5s, Claude_Dev replies with the acknowledgment message
- Within 30s, `systemctl --user list-units --type=service auto-decode-*` shows a running unit
- 20-30 min later, the webhook posts the DISCORD_SUMMARY block

- [ ] **Step 5: If Claude_Dev system prompt is tracked in claude-config repo, commit there**

```bash
# In ~/.claude or wherever claude-config is checked out
git add discord-system-prompt.txt
git commit -m "feat: auto-decode DM trigger handler"
git push
```

If not tracked, document the change manually in BookStack page 115 (Claude Discord Bot).

---

## Task 23: Update decode-publishing-runbook.md to document the auto-decode path

**Files:**
- Modify: `docs/decode-publishing-runbook.md`

- [ ] **Step 1: Add an "Auto-decode pipeline" section near the top**

Insert after the "Bootstrap" section and before "Current state":

```markdown
## Auto-decode pipeline (preferred path)

As of 2026-04-28 (first ship: Axelrod), the entire decode pipeline is automated. Trigger via:

- **Discord DM** to Claude_Dev: `decode @<name>` or `decode 0x<address>`
- **Direct CLI** on sg-scribe: `pnpm decode:auto @<name>`
- **From any Claude with homelab MCP**: `ssh sg-scribe '~/Forge/chainward && pnpm decode:auto @<name>'`

The pipeline produces deliverables, runs a 3-verifier gauntlet, pre-renders OG, deploys, and posts the launch tweet. End-to-end ~20-30 min.

**Discord output:** every run posts a `<DISCORD_SUMMARY>` block to the dedicated webhook channel. `result` field tells you what happened: `ship`, `halt-research-failed`, `halt-writer-failed`, `halt-verifier-failed`, `halt-verification`, `halt-og-render`, `halt-deploy`, `halt-deploy-verify`, `halt-tweet`.

**On halt:** read the verification reports in `deliverables/<slug>/`, decide whether to:
- Re-launch (if it was a transient — e.g., sentinel was lagging)
- Fix the prompt (if a verifier produced false positives or false negatives)
- Hand-finish the decode using the manual flow below (the artifacts are still useful)

The full pipeline spec is at `docs/superpowers/specs/2026-04-28-auto-decode-design.md`.

## Manual flow (fallback for halts)

(The pre-existing content moves below this section, unchanged.)
```

- [ ] **Step 2: Update the "Suggested workflow" for next decode (Axelrod entry)**

Find the "Next decode (queued: Axelrod)" block. Replace the suggested workflow with:

```markdown
**Suggested workflow:**
```bash
ssh sg-scribe
set -a; source ~/.config/systemd/user/auto-decode.env; set +a
pnpm decode:auto @Axelrod
```
Or DM Claude_Dev: `decode @Axelrod`.

The auto-decode pipeline handles all three review checkpoints algorithmically. If it halts, fall back to the manual flow.
```

- [ ] **Step 3: Update the "Tooling" section to add the new command**

Find the "Tooling" block and add:
```
- `pnpm decode:auto @<name>` (`scripts/auto-decode/index.ts`) — fully automated decode pipeline
```

- [ ] **Step 4: Commit**

```bash
git add docs/decode-publishing-runbook.md
git commit -m "docs: document auto-decode pipeline as preferred decode path"
git push origin main
```

---

## Self-review checklist (do this before declaring the plan complete)

Run these checks against the plan before handing it off:

1. **Spec coverage** — every section in `2026-04-28-auto-decode-design.md` has at least one task implementing it. Particularly: trigger surfaces (Tasks 6 + 22), retry policy (Task 16), publish gaps (Tasks 5 + 17), DRY_RUN gate (Task 19).
2. **No placeholders** — every step has either complete code, a complete prompt, or an explicit integration-test procedure. No "TODO" / "implement later".
3. **Type consistency** — `parseTarget`, `slugify`, `resolveTarget`, `checkSlugCollision`, `renderOg` signatures match across tasks 2, 3, 4, 5, 6, and 18.
4. **Test failure → implementation → test pass** — Tasks 2, 3, 4, 5 follow strict TDD. Tasks 6, 14-18 use integration smoke tests instead (since prompts aren't TDD-able).
5. **Calibration gates** — Tasks 19, 20, 21 are integration-test pauses. They're explicit and gate later tasks (22, 23).
