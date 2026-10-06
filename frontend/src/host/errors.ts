export class TimeoutError extends Error {
  override name = "TimeoutError";
}

/** The request was abandoned because the user moved on or the page went away. Never shown or reported. */
export class CancelledError extends Error {
  override name = "CancelledError";
}

export class ConnectError extends Error {
  override name = "ConnectError";
}

/** The agent answered a request with an error. */
export class RemoteError extends Error {
  override name = "RemoteError";
}

export class HttpError extends Error {
  override name = "HttpError";
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export class BadDataError extends Error {
  override name = "BadDataError";
}

export class PageError extends Error {
  override name = "PageError";
}

export function isCancellation(err: unknown): boolean {
  return err instanceof CancelledError || (err instanceof Error && err.name === "AbortError") || (err instanceof DOMException && err.name === "AbortError");
}
