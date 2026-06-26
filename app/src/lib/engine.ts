/**
 * EngineClient — the single connection to the local Python engine.
 *
 * Auto-reconnecting WebSocket. The UI never touches a socket directly; it calls
 * typed command helpers and subscribes to frames through the store. In a Tauri
 * build the engine runs as a bundled sidecar on the same localhost port.
 */
import type { ClientMessage, ServerMessage } from "./protocol";

const ENGINE_URL = "ws://127.0.0.1:8765/ws";

type MessageHandler = (msg: ServerMessage) => void;
type LinkHandler = (open: boolean) => void;

export class EngineClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private onMessage: MessageHandler;
  private onLink: LinkHandler;
  private closedByUser = false;

  constructor(onMessage: MessageHandler, onLink: LinkHandler) {
    this.onMessage = onMessage;
    this.onLink = onLink;
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    try {
      this.ws = new WebSocket(ENGINE_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => this.onLink(true);
    this.ws.onclose = () => {
      this.onLink(false);
      if (!this.closedByUser) this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
    this.ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data) as ServerMessage);
      } catch {
        /* ignore malformed frame */
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 1200);
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }
}
