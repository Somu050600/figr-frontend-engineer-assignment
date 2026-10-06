import { useEffect, useRef } from "react";
import { PreviewConnection } from "../connection/PreviewConnection";
import { handlePush } from "../connection/pushes";
import { installRouter, setConnection } from "../connection/registry";
import { syncScreen } from "../connection/sync";
import { clearPageOverride, consumeOneShot, useFaults } from "../dev/faults";
import { ConnectError } from "../errors";
import { geometry } from "../overlay/geometry";
import { Region, useRegion } from "../regions/Region";
import { useBoard, type Screen } from "../state/board";
import { PREVIEW_H, PREVIEW_W, previewOrigin } from "../state/layout";
import { usePreviews } from "../state/previews";
import { resetScreen } from "../state/reset";
import { Shield } from "./Shield";

const EMPTY: string[] = [];

export function PreviewSlot({ screen, index }: { screen: Screen; index: number }) {
  const o = previewOrigin(index);
  return (
    <div className="preview" style={{ left: o.x, top: o.y, width: PREVIEW_W, height: PREVIEW_H }}>
      <PreviewHeader screen={screen} />
      <Region
        name="preview"
        screenId={screen.id}
        className="preview-frame"
        describe={(e) => (e instanceof ConnectError ? "Couldn't connect to this preview" : "This preview hit an error")}
        onRetry={() => {
          clearPageOverride(screen.id);
          resetScreen(screen.id);
        }}
      >
        <Preview screen={screen} />
      </Region>
    </div>
  );
}

/** Name + "Page error" badge, counter-scaled so it reads the same at every zoom (D20). */
function PreviewHeader({ screen }: { screen: Screen }) {
  const errors = usePreviews((s) => s.byScreen[screen.id]?.pageErrors ?? EMPTY);
  return (
    <div className="preview-header">
      <span className="preview-name">{screen.name}</span>
      {errors.length > 0 && (
        <span className="badge" tabIndex={0} data-chrome>
          Page error{errors.length > 1 ? ` ×${errors.length}` : ""}
          <span className="tip" role="tooltip">
            {errors[errors.length - 1]}
          </span>
        </span>
      )}
    </div>
  );
}

function Preview({ screen }: { screen: Screen }) {
  const region = useRegion();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mode = useBoard((s) => s.mode);
  const src = useFaults((s) => s.pageOverride[screen.id]) ?? screen.url;

  useEffect(() => {
    installRouter();
    const iframe = iframeRef.current!;
    const conn = new PreviewConnection(screen.id, new URL(screen.url).origin, () => useBoard.getState().mode, {
      onReady: region.guard((_docId: string, navigated: boolean) => {
        if (navigated) resetScreen(screen.id); // R3.8: selection clears, layers show the new page
        usePreviews.getState().setStatus(screen.id, "ready");
        syncScreen(screen.id, true);
      }),
      onPush: region.guard((msg) => {
        if (consumeOneShot("message", screen.id)) throw new Error("Dev: simulated error in a message handler");
        handlePush(screen.id, msg);
      }),
      onDead: (err) => {
        usePreviews.getState().setStatus(screen.id, "error");
        geometry.clearScreen(screen.id);
        region.capture(err);
      },
    });
    setConnection(screen.id, conn);
    conn.attach(iframe.contentWindow!);
    usePreviews.getState().setStatus(screen.id, "connecting");
    const onLoad = () => conn.loaded();
    iframe.addEventListener("load", onLoad);
    return () => {
      iframe.removeEventListener("load", onLoad);
      conn.dispose();
      setConnection(screen.id, null);
    };
  }, [region, screen.id, screen.url]);

  return (
    <>
      <iframe ref={iframeRef} className="preview-iframe" src={src} title={screen.name} width={PREVIEW_W} height={PREVIEW_H} />
      {mode === "select" && <Shield screenId={screen.id} />}
    </>
  );
}
