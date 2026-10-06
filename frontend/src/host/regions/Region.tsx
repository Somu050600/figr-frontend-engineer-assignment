import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isCancellation } from "../errors";
import { registerRegion, regionKey } from "./registry";
import { RegionError } from "./RegionError";
import { reportFailure, toError, type FailureContext, type RegionName } from "./reportFailure";

// A Region is the unit of failure containment (R6.1). Whatever goes wrong inside
// it — render, event handler, timer, message handler, async response — ends up
// in capture(): reported once, shown as this region's error with a Retry, and
// nothing outside it is affected (R6.2, R6.5).

export interface RegionApi {
  ctx: FailureContext;
  capture(err: unknown): void;
  /** Wrap any non-render callback; sync throws and rejected promises are captured. */
  guard<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R | undefined;
  /** Timers owned by the region: guarded, and cleared when the region goes away. */
  setTimeout(fn: () => void, ms: number): number;
  setInterval(fn: () => void, ms: number): number;
}

const RegionContext = createContext<RegionApi | null>(null);

export function useRegion(): RegionApi {
  const r = useContext(RegionContext);
  if (!r) throw new Error("useRegion() used outside a <Region>");
  return r;
}

class Boundary extends Component<{ onError(err: unknown): void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(err: unknown) {
    this.props.onError(err);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props {
  name: RegionName;
  screenId: string | null;
  elementKey?: string;
  /** Title shown for an error; defaults per region. */
  describe?: (err: Error) => string;
  onRetry?: () => void;
  className?: string;
  children: ReactNode;
}

const DEFAULT_TITLES: Record<RegionName, string> = {
  board: "Couldn't load the board",
  preview: "This preview hit an error",
  layers: "The layers panel hit an error",
  "layers-row": "Couldn't load",
  details: "Couldn't load details",
  inspector: "The inspector hit an error",
};

export function Region({ name, screenId, elementKey, describe, onRetry, className, children }: Props) {
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const timers = useRef(new Set<number>());
  const ctx = useMemo<FailureContext>(
    () => ({ region: name, screenId, ...(elementKey ? { elementKey } : {}) }),
    [name, screenId, elementKey],
  );
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  const capture = useCallback((err: unknown) => {
    if (!mounted.current || isCancellation(err)) return;
    const e = toError(err);
    reportFailure(e, ctxRef.current);
    setError((prev) => prev ?? e);
  }, []);

  const retry = useCallback(() => {
    onRetryRef.current?.();
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  const api = useMemo<RegionApi>(() => {
    const guard: RegionApi["guard"] =
      (fn) =>
      (...args) => {
        try {
          const r = fn(...args);
          if (r && typeof (r as { then?: unknown }).then === "function") (r as unknown as Promise<unknown>).then(undefined, capture);
          return r;
        } catch (e) {
          capture(e);
          return undefined;
        }
      };
    return {
      get ctx() {
        return ctxRef.current;
      },
      capture,
      guard,
      setTimeout(fn, ms) {
        const id = window.setTimeout(() => {
          timers.current.delete(id);
          guard(fn)();
        }, ms);
        timers.current.add(id);
        return id;
      },
      setInterval(fn, ms) {
        const id = window.setInterval(guard(fn), ms);
        timers.current.add(id);
        return id;
      },
    };
  }, [capture]);

  useLayoutEffect(() => {
    mounted.current = true;
    const owned = timers.current;
    return () => {
      mounted.current = false;
      for (const id of owned) {
        clearTimeout(id);
        clearInterval(id);
      }
      owned.clear();
    };
  }, []);

  useEffect(
    () => registerRegion(regionKey(name, screenId), { capture, retry, setTimeout: (fn, ms) => void api.setTimeout(fn, ms) }),
    [name, screenId, capture, retry, api],
  );

  return (
    <RegionContext.Provider value={api}>
      <div className={className ? `region ${className}` : "region"} data-region={name}>
        {error ? (
          <RegionError title={describe?.(error) ?? DEFAULT_TITLES[name]} detail={error.message} onRetry={retry} />
        ) : (
          <Boundary key={attempt} onError={capture}>
            {children}
          </Boundary>
        )}
      </div>
    </RegionContext.Provider>
  );
}
