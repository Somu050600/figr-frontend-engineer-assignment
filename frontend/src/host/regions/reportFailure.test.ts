import { describe, expect, it, vi } from "vitest";
import { CancelledError, TimeoutError } from "../errors";
import { reportFailure } from "./reportFailure";

const ctx = { region: "details", screenId: "scr-01", elementKey: "cta-primary" } as const;

describe("reportFailure", () => {
  it("reports an error once even if seen twice", () => {
    const sink = vi.fn();
    const err = new TimeoutError("x");
    expect(reportFailure(err, ctx, sink)).toBe(true);
    expect(reportFailure(err, { region: "inspector", screenId: null }, sink)).toBe(false);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(err, ctx);
  });

  it("counts a retry's new failure again", () => {
    const sink = vi.fn();
    reportFailure(new Error("a"), ctx, sink);
    reportFailure(new Error("a"), ctx, sink);
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("never reports cancellations", () => {
    const sink = vi.fn();
    expect(reportFailure(new CancelledError(), ctx, sink)).toBe(false);
    expect(reportFailure(new DOMException("aborted", "AbortError"), ctx, sink)).toBe(false);
    expect(sink).not.toHaveBeenCalled();
  });

  it("omits elementKey when absent and wraps non-errors", () => {
    const sink = vi.fn();
    reportFailure("boom", { region: "board", screenId: null }, sink);
    const [e, c] = sink.mock.calls[0];
    expect(e).toBeInstanceOf(Error);
    expect(c).toEqual({ region: "board", screenId: null });
  });
});
