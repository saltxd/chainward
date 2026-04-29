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
