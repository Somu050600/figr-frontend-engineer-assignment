import { API_BASE } from "../config";
import { takeFailNext, useFaults } from "../dev/faults";
import { BadDataError } from "../errors";

export function apiUrl(path: string, endpoint: "screens" | "details"): string {
  const url = new URL(path, API_BASE);
  const { latencyMs } = useFaults.getState();
  if (latencyMs) url.searchParams.set("latency", String(latencyMs));
  if (takeFailNext(endpoint)) url.searchParams.set("fail", "1");
  return url.toString();
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
