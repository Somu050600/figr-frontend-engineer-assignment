import { afterEach, describe, expect, it, vi } from "vitest";
import { useFaults } from "../dev/faults";
import { BadDataError, HttpError } from "../errors";
import { fetchDetails } from "./elements";
import { fetchScreens } from "./screens";

const respond = (status: number, body: string) => vi.fn(async () => new Response(body, { status }));
const signal = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("fetchDetails", () => {
  it("returns details", async () => {
    vi.stubGlobal("fetch", respond(200, JSON.stringify({ component: "Button", description: "d", status: "stable", owner: "o" })));
    await expect(fetchDetails("cta", signal)).resolves.toEqual({ component: "Button", description: "d", status: "stable", owner: "o" });
  });
  it("treats 404 as no details, not an error", async () => {
    vi.stubGlobal("fetch", respond(404, "{}"));
    await expect(fetchDetails("x", signal)).resolves.toBeNull();
  });
  it("throws HttpError on 5xx", async () => {
    vi.stubGlobal("fetch", respond(503, "{}"));
    await expect(fetchDetails("x", signal)).rejects.toBeInstanceOf(HttpError);
  });
  it("throws BadDataError on a truncated 200 body", async () => {
    vi.stubGlobal("fetch", respond(200, '{"component": "Butt'));
    await expect(fetchDetails("x", signal)).rejects.toBeInstanceOf(BadDataError);
  });
  it("throws BadDataError on the wrong shape", async () => {
    vi.stubGlobal("fetch", respond(200, JSON.stringify({ component: 3 })));
    await expect(fetchDetails("x", signal)).rejects.toBeInstanceOf(BadDataError);
  });
  it("adds ?fail=1 once when the dev fault is armed", async () => {
    const f = respond(404, "{}");
    vi.stubGlobal("fetch", f);
    useFaults.setState({ failNext: { screens: false, details: true } });
    await fetchDetails("x", signal);
    await fetchDetails("x", signal);
    const urls = f.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls[0]).toContain("fail=1");
    expect(urls[1]).not.toContain("fail=1");
  });
});

describe("fetchScreens", () => {
  it("validates the list", async () => {
    vi.stubGlobal("fetch", respond(200, JSON.stringify([{ id: "a", name: "A", url: "http://x/p.html" }])));
    await expect(fetchScreens(signal)).resolves.toHaveLength(1);
    vi.stubGlobal("fetch", respond(200, JSON.stringify([{ id: "a" }])));
    await expect(fetchScreens(signal)).rejects.toBeInstanceOf(BadDataError);
  });
});
