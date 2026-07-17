"""Start the existing Python API inside the Android application."""

from __future__ import annotations

import os
import threading


def start(data_dir: str) -> None:
    os.environ["SPORTTERY_DATA_DIR"] = data_dir
    from http.server import ThreadingHTTPServer
    from sporttery_web import Handler

    server = ThreadingHTTPServer(("127.0.0.1", 8765), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
