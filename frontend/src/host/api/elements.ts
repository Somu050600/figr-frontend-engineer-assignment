import { BadDataError, HttpError } from "../errors";
import { apiFetch, isString, parseJson } from "./http";

export interface ElementDetails {
  component: string;
  description: string;
  status: string;
  owner: string;
}

const isDetails = (v: unknown): v is ElementDetails => {
  const d = v as Record<string, unknown>;
  return typeof v === "object" && v !== null && isString(d.component) && isString(d.description) && isString(d.status) && isString(d.owner);
};

/** Details for a data-key, or null when the API has none (404 is not an error, R5.1). */
export async function fetchDetails(key: string, signal: AbortSignal): Promise<ElementDetails | null> {
  const res = await apiFetch(`/elements/${encodeURIComponent(key)}`, "details", signal);
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status);
  const data = await parseJson(res);
  if (!isDetails(data)) throw new BadDataError("Unexpected element details");
  return { component: data.component, description: data.description, status: data.status, owner: data.owner };
}
