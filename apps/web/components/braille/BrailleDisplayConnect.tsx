"use client";

/**
 * Braille display connection panel + context.
 *
 *   <BrailleProvider callbacks={...}>      in the root layout (next to <VoxideWidget/>)
 *     <BrailleDisplayConnect />            in settings or the reader toolbar
 *   const { manager } = useBraille();      manager.show(sectionText) from the reader
 *
 * Accessibility rules followed here:
 *  - every state change is announced in a role="status" region
 *  - one keyboard shortcut (Alt+Shift+B) opens the display chooser from anywhere
 *  - the last approved display reconnects on page load with no dialog
 *  - the visual braille mirror is aria-hidden so it never reaches the screen reader twice
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiTranslator, BrailleManager, ManagerCallbacks } from "@/lib/braille/brailleManager";
import { BridgeDisplay } from "@/lib/braille/bridgeDisplay";
import { isWebHidSupported, reconnectHidBrailleDisplay, requestHidBrailleDisplay } from "@/lib/braille/hidBrailleDisplay";
import { ScreenReaderDisplay } from "@/lib/braille/screenReaderDisplay";
import { VirtualBrailleDisplay } from "@/lib/braille/virtualDisplay";
import { BrailleDisplay, BrailleDisplayInfo, cellsToUnicode } from "@/lib/braille/types";

interface BrailleCtx {
  manager: BrailleManager;
  info: BrailleDisplayInfo | null;
  status: string;
  connectHid(): Promise<void>;
  connectBridge(): Promise<void>;
  connectScreenReader(): Promise<void>;
  connectVirtual(mode?: "local" | "ws" | "auto"): Promise<void>;
  disconnect(): Promise<void>;
  setTable(table: string): void;
  lineRef: React.RefObject<HTMLDivElement | null>;
}

const Ctx = createContext<BrailleCtx | null>(null);

export function useBraille(): BrailleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBraille must be used inside <BrailleProvider>");
  return ctx;
}

export function BrailleProvider({
  children,
  apiBase = "/api",
  callbacks = {},
}: {
  children: React.ReactNode;
  apiBase?: string;
  callbacks?: ManagerCallbacks;
}) {
  const [info, setInfo] = useState<BrailleDisplayInfo | null>(null);
  const [status, setStatus] = useState("");
  const lineRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const manager = useMemo(
    () =>
      new BrailleManager(new ApiTranslator(apiBase), "en-ueb-g2", {
        onRoute: (i) => cbRef.current.onRoute?.(i),
        onNavigate: (d) => cbRef.current.onNavigate?.(d),
        onTyped: (t) => cbRef.current.onTyped?.(t),
        onCommand: (e) => cbRef.current.onCommand?.(e),
        onAnnounce: (m) => setStatus(m),
      }),
    [apiBase],
  );

  const attach = useCallback(
    async (display: BrailleDisplay) => {
      await manager.attach(display);
      setInfo(display.info);
      setStatus(`Braille display connected: ${display.info.name}.`);
      display.onDisconnect(() => {
        setInfo(null);
        if (display.info.transport === "virtual") {
          // A virtual display only drops when the server it talked to restarts. Replace it with the
          // in-browser one, which needs no server, so the display never silently disappears.
          setStatus("Virtual Braille display reconnected.");
          void attachRef.current?.(VirtualBrailleDisplay.connectLocal());
        } else {
          setStatus("Braille display disconnected.");
        }
      });
    },
    [manager],
  );
  const attachRef = useRef<typeof attach | null>(null);
  attachRef.current = attach;

  const connectHid = useCallback(async () => {
    if (!isWebHidSupported()) {
      setStatus("Direct connection needs Chrome or Edge. Try the Braille Talks Bridge or your screen reader instead.");
      return;
    }
    try {
      setStatus("Choose your Braille display in the browser dialog.");
      const d = await requestHidBrailleDisplay();
      if (d) await attach(d);
      else setStatus("No display chosen.");
    } catch (e) {
      setStatus(`Could not connect directly: ${(e as Error).message} Try the Braille Talks Bridge.`);
    }
  }, [attach]);

  const connectBridge = useCallback(async () => {
    try {
      setStatus("Looking for the Braille Talks Bridge on this computer.");
      await attach(await BridgeDisplay.connect());
    } catch (e) {
      setStatus((e as Error).message);
    }
  }, [attach]);

  const connectScreenReader = useCallback(async () => {
    if (lineRef.current) await attach(new ScreenReaderDisplay(lineRef.current));
  }, [attach]);

  const connectVirtual = useCallback(
    async (mode: "local" | "ws" | "auto" = "local") => {
      try {
        setStatus("Connecting to Virtual Braille Simulator...");
        const d = await VirtualBrailleDisplay.connect({ mode });
        await attach(d);
      } catch (e) {
        setStatus(`Virtual display error: ${(e as Error).message}`);
      }
    },
    [attach],
  );

  const disconnect = useCallback(async () => {
    await manager.detach();
    setInfo(null);
    setStatus("Braille display disconnected.");
  }, [manager]);

  const setTable = useCallback((t: string) => {
    void manager.setTable(t);
  }, [manager]);

  // Silent reconnect on load: approved HID display, then a running bridge, then virtual fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hid = await reconnectHidBrailleDisplay().catch(() => null);
      if (cancelled) return;
      if (hid) return attach(hid);
      const bridge = await BridgeDisplay.connect(undefined, 800).catch(() => null);
      if (cancelled) return;
      if (bridge) return attach(bridge);

      // Automatic fallback to Virtual Simulator in local development when no hardware or bridge is detected
      const virtual = await VirtualBrailleDisplay.connect({ mode: "local" }).catch(() => null);
      if (!cancelled && virtual) {
        await attach(virtual);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attach]);

  // Alt+Shift+B from anywhere opens the chooser (a key press counts as the required user gesture).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyB") {
        e.preventDefault();
        void connectHid();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectHid]);

  const value = { manager, info, status, connectHid, connectBridge, connectScreenReader, connectVirtual, disconnect, setTable, lineRef };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>
    </Ctx.Provider>
  );
}

export function BrailleDisplayConnect({ tables }: { tables?: { id: string; label: string }[] }) {
  const b = useBraille();
  const [mirror, setMirror] = useState("");

  // Visual mirror for sighted teammates and judges (hidden from assistive tech).
  useEffect(() => {
    const t = setInterval(() => setMirror(cellsToUnicode(b.manager.visibleCells())), 300);
    return () => clearInterval(t);
  }, [b.manager]);

  return (
    <section aria-labelledby="braille-heading">
      <h2 id="braille-heading">Braille display</h2>
      <p>{b.info ? `Connected: ${b.info.name}.` : "No display connected."}</p>

      <div role="group" aria-label="Connect a display">
        {isWebHidSupported() && (
          <button type="button" onClick={b.connectHid} aria-keyshortcuts="Alt+Shift+B">
            Connect display over USB or Bluetooth
          </button>
        )}
        <button type="button" onClick={b.connectBridge}>
          Connect through Braille Talks Bridge
        </button>
        <button type="button" onClick={b.connectScreenReader}>
          Use my screen reader&apos;s display
        </button>
        <button type="button" onClick={() => void b.connectVirtual()}>
          Connect Virtual Simulator
        </button>
        {b.info && (
          <button type="button" onClick={b.disconnect}>
            Disconnect
          </button>
        )}
      </div>

      {tables && (
        <label>
          Braille code
          <select defaultValue="en-ueb-g2" onChange={(e) => b.setTable(e.target.value)}>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Screen-reader transport writes the current segment here. */}
      <div ref={b.lineRef} tabIndex={0} role="document" aria-label="Braille line" />

      <p aria-hidden="true" style={{ fontSize: "1.5rem", letterSpacing: "0.1em" }}>
        {mirror}
      </p>
    </section>
  );
}
