import { report } from "../../../report.js";
import { isCancellation } from "../errors";

export type RegionName = "board" | "preview" | "layers" | "layers-row" | "details" | "inspector";

export interface FailureContext {
  region: RegionName;
  screenId: string | null;
  elementKey?: string;
}

type Sink = (error: unknown, context: FailureContext) => void;

const reported = new WeakSet<object>();

export function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : JSON.stringify(err));
}

/**
 * The single way failures reach report(). The same error object seen by both a
 * catch and an error boundary is reported once; a retry produces a new error
 * object, so it counts again (R6.4). Cancellations are not failures.
 * Returns true when this call reported.
 */
export function reportFailure(err: unknown, ctx: FailureContext, sink: Sink = report): boolean {
  if (isCancellation(err)) return false;
  const e: object = typeof err === "object" && err !== null ? err : toError(err);
  if (reported.has(e)) return false;
  reported.add(e);
  const context: FailureContext = { region: ctx.region, screenId: ctx.screenId };
  if (ctx.elementKey) context.elementKey = ctx.elementKey;
  sink(e, context);
  return true;
}
