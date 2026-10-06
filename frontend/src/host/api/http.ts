import { API_BASE } from "../config";
import { disarmFailNext, useFaults } from "../dev/faults";
import { BadDataError } from "../errors";

/**
 * fetch() against the API with dev faults applied. An armed "fail next" fault
 * applies to every request that starts while it is armed and is cleared by the
 * first one that completes — so an aborted request (selection changed,
 * StrictMode's double effect) never uses it up.
 */
export async function apiFetch(path: string, endpoint: "screens" | "details", signal: AbortSignal): Promise<Response> {
  const url = new URL(path, API_BASE);
  const { latencyMs, failNext } = useFaults.getState();
  if (latencyMs) url.searchParams.set("latency", String(latencyMs));
  const failing = failNext[endpoint];
  if (failing) url.searchParams.set("fail", "1");
  const res = await fetch(url.toString(), { signal });
  if (failing) disarmFailNext(endpoint);
  return res;
}

/** The API's failure mode includes a 200 with a truncated body — parse defensively. */
export async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new BadDataError(`Malformed response body: ${text.slice(0, 40)}`);
  }
}

export const isString = (v: unknown): v is string => typeof v === "string";
