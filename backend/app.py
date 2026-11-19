#!/usr/bin/env python3
"""CRIMSON — Flask + SQLite Application Server.

Serves the frontend (index.html, css/, js/, assets/, data/) and the REST API
(/api/bootstrap, /api/auth/*, /api/users/*, /api/user/state, /api/cms/*).

Run:
    python backend/app.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from flask import Flask, Response, send_from_directory

from backend.auth import auth_bp
from backend.cms import cms_bp
from backend.db import close_db, init_db


def create_app() -> Flask:
    init_db(force_reset=False)

    app = Flask(__name__, static_folder=str(ROOT_DIR), static_url_path="")
    app.config["JSON_SORT_KEYS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB for image data URLs / snapshots

    app.teardown_appcontext(close_db)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cms_bp)

    @app.after_request
    def add_no_cache_headers(resp: Response) -> Response:
        if resp.mimetype in ("application/javascript", "text/css", "text/html", "application/json"):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return resp

    @app.get("/")
    def serve_index() -> Response:
        return send_from_directory(str(ROOT_DIR), "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"[CRIMSON] SQL + Flask server running on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
