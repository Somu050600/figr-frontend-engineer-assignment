import { BadDataError, HttpError } from "../errors";
import type { Screen } from "../state/board";
import { apiFetch, isString, parseJson } from "./http";

const isScreen = (v: unknown): v is Screen => {
  const s = v as Record<string, unknown>;
  return typeof v === "object" && v !== null && isString(s.id) && isString(s.name) && isString(s.url);
};

export async function fetchScreens(signal: AbortSignal): Promise<Screen[]> {
  const res = await apiFetch("/screens", "screens", signal);
  if (!res.ok) throw new HttpError(res.status);
  const data = await parseJson(res);
  if (!Array.isArray(data) || !data.every(isScreen)) throw new BadDataError("Unexpected /screens response");
  return data;
}
