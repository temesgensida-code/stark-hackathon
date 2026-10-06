/**
 * VirtualBrailleDisplay: Hardware Simulator Driver.
 *
 * Implements the BrailleDisplay interface for the 40-cell virtual hardware simulator.
 * Supports hybrid mode:
 *   - Local/In-Memory mode: Zero latency event bus between BrailleManager and the simulator UI.
 *   - Network mode: WebSocket connection to FastAPI /braille/simulate for multi-client / remote usage.
 */

import { BrailleDisplay, BrailleDisplayInfo, BrailleKeyEvent, Emitter } from "./types";

export interface VirtualHello {
  type: "hello";
  driver: string;
  model: string;
  cells: number;
  rows: number;
  version: number;
}

/**
 * Shared in-memory event bus connecting VirtualBrailleDisplay instances
 * and the <BrailleHardwareSimulator /> React component.
 */
export class VirtualSimulatorBus {
  private cellsState = new Uint8Array(40);
  private writeEmitter = new Emitter<Uint8Array>();
  private keyEmitter = new Emitter<BrailleKeyEvent>();
  private activeDisplay: VirtualBrailleDisplay | null = null;

  get cells(): Uint8Array {
    return this.cellsState;
  }

  get isConnected(): boolean {
    return this.activeDisplay !== null;
  }

  get mode(): "local" | "ws" | "none" {
    if (!this.activeDisplay) return "none";
    return this.activeDisplay.mode;
  }

  setActiveDisplay(display: VirtualBrailleDisplay | null): void {
    this.activeDisplay = display;
  }

  setCells(cells: ArrayLike<number>): void {
    const fit = new Uint8Array(40);
    for (let i = 0; i < Math.min(40, cells.length); i++) {
      fit[i] = cells[i] & 0xff;
    }
    this.cellsState = fit;
    this.writeEmitter.emit(fit);
  }

  onWrite(listener: (cells: Uint8Array) => void): () => void {
    return this.writeEmitter.on(listener);
  }

  onKey(listener: (event: BrailleKeyEvent) => void): () => void {
    return this.keyEmitter.on(listener);
  }

  /**
   * Called by the interactive UI component when the user presses
   * routing keys, pan buttons, rockers, or Perkins chords.
   */
  sendKey(event: BrailleKeyEvent): void {
    if (this.activeDisplay) {
      this.activeDisplay.dispatchHardwareKey(event);
    } else {
      this.keyEmitter.emit(event);
    }
  }

  reset(): void {
    this.setCells(new Uint8Array(40));
  }
}

export const virtualSimulatorBus = new VirtualSimulatorBus();

export function getDefaultSimulatorWsUrl(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1:8000/braille/simulate";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.port === "3000") {
    return `${protocol}//${window.location.hostname}:8000/braille/simulate`;
  }
  return `${protocol}//${window.location.host}/braille/simulate`;
}

export interface VirtualDisplayOptions {
  cells?: number;
  mode?: "local" | "ws" | "auto";
  wsUrl?: string;
  timeoutMs?: number;
}

export class VirtualBrailleDisplay implements BrailleDisplay {
  readonly info: BrailleDisplayInfo;
  readonly mode: "local" | "ws";
  private keys = new Emitter<BrailleKeyEvent>();
  private gone = new Emitter<void>();
  private ws: WebSocket | null = null;
  private unsubBusKey: (() => void) | null = null;

  private constructor(
    mode: "local" | "ws",
    cells = 40,
    modelName = "Virtual 40-Cell Display",
    ws: WebSocket | null = null,
  ) {
    this.mode = mode;
    this.ws = ws;
    this.info = {
      transport: "virtual",
      name: `${modelName} (${mode === "ws" ? "WebSocket" : "In-Memory"})`,
      cells,
      rows: 1,
    };

    virtualSimulatorBus.setActiveDisplay(this);

    // Listen to local hardware simulator key presses
    this.unsubBusKey = virtualSimulatorBus.onKey((event) => {
      this.keys.emit(event);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "key", ...event }));
      }
    });

    if (ws) {
      ws.addEventListener("message", (m) => {
        try {
          const msg = JSON.parse(String(m.data));
          if (msg.type === "write" && Array.isArray(msg.cells)) {
            virtualSimulatorBus.setCells(msg.cells);
          } else if (msg.type === "key") {
            const { type: _t, ...event } = msg;
            this.keys.emit(event as BrailleKeyEvent);
          }
        } catch {
          // ignore malformed frame
        }
      });
      ws.addEventListener("close", () => {
        this.gone.emit();
        virtualSimulatorBus.setActiveDisplay(null);
      });
    }
  }

  /**
   * Dispatches a key press originating from the local interactive UI component.
   */
  dispatchHardwareKey(event: BrailleKeyEvent): void {
    this.keys.emit(event);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "key", ...event }));
    }
  }

  /** Create an instant, zero-latency in-memory virtual display. */
  static connectLocal(cells = 40): VirtualBrailleDisplay {
    return new VirtualBrailleDisplay("local", cells);
  }

  /** Connect via WebSocket to the backend simulation endpoint. */
  static connectWs(url = getDefaultSimulatorWsUrl(), timeoutMs = 2500): Promise<VirtualBrailleDisplay> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Braille Simulator WebSocket timed out."));
      }, timeoutMs);

      ws.addEventListener("message", function first(m) {
        try {
          const msg = JSON.parse(String(m.data));
          if (msg.type === "hello") {
            ws.removeEventListener("message", first);
            clearTimeout(timer);
            const cells = msg.cells || 40;
            const model = msg.model || "Virtual 40-Cell Hardware";
            resolve(new VirtualBrailleDisplay("ws", cells, model, ws));
          }
        } catch {}
      });

      ws.addEventListener("close", () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to Braille Simulator WebSocket."));
      });
    });
  }

  /**
   * Connect with auto fallback: attempts WebSocket if specified or in 'auto' mode;
   * seamlessly falls back to in-memory mode if WebSocket is not available.
   */
  static async connect(options: VirtualDisplayOptions = {}): Promise<VirtualBrailleDisplay> {
    const { mode = "auto", wsUrl = getDefaultSimulatorWsUrl(), cells = 40, timeoutMs = 1200 } = options;

    if (mode === "local") {
      return VirtualBrailleDisplay.connectLocal(cells);
    }

    if (mode === "ws") {
      return VirtualBrailleDisplay.connectWs(wsUrl, timeoutMs);
    }

    // Auto mode: try WS, fallback to local on error
    try {
      return await VirtualBrailleDisplay.connectWs(wsUrl, timeoutMs);
    } catch {
      return VirtualBrailleDisplay.connectLocal(cells);
    }
  }

  async write(cells: Uint8Array): Promise<void> {
    virtualSimulatorBus.setCells(cells);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "write", cells: Array.from(cells) }));
    }
  }

  onKey(listener: (event: BrailleKeyEvent) => void): () => void {
    return this.keys.on(listener);
  }

  onDisconnect(listener: () => void): () => void {
    return this.gone.on(listener);
  }

  async close(): Promise<void> {
    if (this.unsubBusKey) {
      this.unsubBusKey();
      this.unsubBusKey = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    virtualSimulatorBus.setActiveDisplay(null);
    this.gone.emit();
  }
}
