/**
 * Client for the Braille Talks local bridge (bridge/braille_bridge.py).
 *
 * The bridge runs on the user's computer, talks to BRLTTY through BrlAPI and
 * so reaches almost every display model (USB, Bluetooth, serial), including
 * ones that do not support HID Braille. Browsers treat 127.0.0.1 as a secure
 * origin, so an HTTPS page may open ws://127.0.0.1.
 */

import { BrailleDisplay, BrailleDisplayInfo, BrailleKeyEvent, Emitter } from "./types";

export const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:8765";

interface Hello {
  type: "hello";
  driver: string;
  model: string;
  cells: number;
  rows: number;
  version: number;
}

export class BridgeDisplay implements BrailleDisplay {
  readonly info: BrailleDisplayInfo;
  private keys = new Emitter<BrailleKeyEvent>();
  private gone = new Emitter<void>();

  private constructor(private ws: WebSocket, hello: Hello) {
    this.info = {
      transport: "bridge",
      name: `${hello.model || hello.driver}, ${hello.cells} cells`,
      cells: hello.cells,
      rows: hello.rows || 1,
    };
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.type === "key") {
        const { type: _t, ...event } = msg;
        this.keys.emit(event as BrailleKeyEvent);
      }
    });
    ws.addEventListener("close", () => this.gone.emit());
  }

  /** Resolves once the bridge says hello; rejects fast if nothing is listening. */
  static connect(url = DEFAULT_BRIDGE_URL, timeoutMs = 2500): Promise<BridgeDisplay> {
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
        reject(new Error("Braille Talks Bridge is not running on this computer."));
      }, timeoutMs);
      ws.addEventListener("message", function first(m) {
        const msg = JSON.parse(String(m.data));
        if (msg.type !== "hello") return;
        ws.removeEventListener("message", first);
        clearTimeout(timer);
        if (!msg.cells) {
          ws.close();
          reject(new Error("The bridge is running but no Braille display is connected to BRLTTY."));
          return;
        }
        resolve(new BridgeDisplay(ws, msg as Hello));
      });
      ws.addEventListener("close", (e) => {
        clearTimeout(timer);
        reject(new Error(e.code === 4003 ? "The bridge refused this site. Start it with --allow-origin for this address." : "Could not reach the Braille Talks Bridge."));
      });
    });
  }

  async write(cells: Uint8Array): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "write", cells: Array.from(cells) }));
  }
  onKey(l: (e: BrailleKeyEvent) => void) {
    return this.keys.on(l);
  }
  onDisconnect(l: () => void) {
    return this.gone.on(l);
  }
  async close(): Promise<void> {
    this.ws.close();
  }
}
