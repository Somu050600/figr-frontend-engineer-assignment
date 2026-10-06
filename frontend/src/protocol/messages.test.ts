import { describe, expect, it } from "vitest";
import { envelope, isEnvelope, NS, VERSION } from "./messages";

describe("envelope", () => {
  it("builds a tagged envelope and omits absent fields", () => {
    expect(envelope("d1", "ping", {})).toEqual({ ns: NS, v: VERSION, docId: "d1", kind: "ping", payload: {} });
    expect(envelope("d1", "reply", { ok: true }, 7, "boom")).toMatchObject({ reqId: 7, error: "boom" });
  });

  it("recognises only our envelopes", () => {
    expect(isEnvelope(envelope("d", "hello", {}))).toBe(true);
    expect(isEnvelope({ ns: "other", v: 1, docId: "d", kind: "x" })).toBe(false);
    expect(isEnvelope({ ns: NS, v: 2, docId: "d", kind: "x" })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope("figr")).toBe(false);
  });
});
