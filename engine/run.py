"""Entry point for the RoboStore Studio engine (and Tauri sidecar)."""

from __future__ import annotations

import argparse
import pathlib

from aiohttp import web

from .app import Engine, build_app, HTTP_PORT


def main() -> None:
    ap = argparse.ArgumentParser(description="RoboStore Studio engine")
    ap.add_argument("--sim", action="store_true", help="Force simulator (no hardware)")
    ap.add_argument("--port", default=None, help="Serial port of the Revo2 hand")
    ap.add_argument("--http-port", type=int, default=HTTP_PORT, help="Local HTTP/WS port")
    ap.add_argument("--serve-static", default=None, help="Serve a built UI directory")
    args = ap.parse_args()

    engine = Engine(port=args.port, force_sim=args.sim)
    static_dir = pathlib.Path(args.serve_static).resolve() if args.serve_static else None
    app = build_app(engine, static_dir)

    mode = "Simulator" if (engine.force_sim or not engine.port) else f"Revo2 @ {engine.port}"
    print(f"RoboStore Studio engine — {mode}")
    print(f"  ws://127.0.0.1:{args.http_port}/ws   (Ctrl+C to stop)")
    web.run_app(app, host="127.0.0.1", port=args.http_port, access_log=None, print=None)


if __name__ == "__main__":
    main()
