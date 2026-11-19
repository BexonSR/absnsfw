"""Authentication, Session Management & SQL User Directory Endpoints."""
from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable

from flask import Blueprint, jsonify, make_response, request

from .db import (
    DEFAULT_USER_SETTINGS,
    get_db,
    get_user_state,
    hash_password,
    seed_user_default_media,
    verify_password,
)

auth_bp = Blueprint("auth", __name__)

COOKIE_NAME = "crimson_session"
SESSION_DAYS = 30
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")


def serialize_user(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "role": row["role"],
        "planBadge": row["plan_badge"],
        "avatarUrl": row["avatar_url"] or "",
        "themePref": row["theme_pref"] or "system",
        "createdAt": row["created_at"],
        "lastLoginAt": row["last_login_at"],
    }


def validate_username_format(username: str) -> tuple[bool, str]:
    u = (username or "").strip()
    if len(u) < 3:
        return False, "Username must be at least 3 characters."
    if len(u) > 24:
        return False, "Username must be 24 characters or fewer."
    if not USERNAME_RE.match(u):
        return False, "Use only letters, numbers, underscores (_), dots (.), or hyphens (-)."
    return True, ""


def get_current_user() -> dict[str, Any] | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    if not token:
        return None

    conn = get_db()
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    row = conn.execute(
        """SELECT u.* FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token = ? AND s.expires_at > ?""",
        (token, now_iso),
    ).fetchone()
    return serialize_user(row) if row else None


def require_auth(fn: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = get_current_user()
        if not user:
            return jsonify({"ok": False, "error": "Authentication required. Please sign in."}), 401
        return fn(*args, current_user=user, **kwargs)

    return wrapper


def require_admin(fn: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = get_current_user()
        if not user:
            return jsonify({"ok": False, "error": "Admin sign-in required."}), 401
        if user.get("role") != "admin":
            return jsonify({"ok": False, "error": "Admin privileges required for this action."}), 403
        return fn(*args, current_user=user, **kwargs)

    return wrapper


def create_session_response(user_row: Any, status: int = 200) -> Any:
    conn = get_db()
    token = secrets.token_urlsafe(36)
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=SESSION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    ua = (request.headers.get("User-Agent") or "")[:200]

    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
        (token, user_row["id"], expires, ua),
    )
    conn.execute(
        "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
        (user_row["id"],),
    )
    conn.commit()

    refreshed = conn.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],)).fetchone()
    payload = {
        "ok": True,
        "token": token,
        "user": serialize_user(refreshed),
        "userState": get_user_state(conn, user_row["id"]),
    }
    resp = make_response(jsonify(payload), status)
    resp.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    return resp


@auth_bp.get("/api/auth/check-username")
def check_username() -> Any:
    u = (request.args.get("u") or "").strip()
    exclude_id = request.args.get("excludeId", type=int)
    valid, msg = validate_username_format(u)
    if not valid:
        return jsonify({"ok": True, "available": False, "valid": False, "message": msg})

    conn = get_db()
    if exclude_id:
        row = conn.execute("SELECT id FROM users WHERE username = ? AND id != ?", (u, exclude_id)).fetchone()
    else:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (u,)).fetchone()

    available = row is None
    return jsonify(
        {
            "ok": True,
            "available": available,
            "valid": True,
            "message": f"@{u} is available" if available else f"@{u} is already taken",
        }
    )


@auth_bp.post("/api/auth/register")
def register() -> Any:
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    display_name = (data.get("displayName") or username).strip()
    password = data.get("password") or ""
    plan_badge = (data.get("planBadge") or "Premium 4K").strip() or "Premium 4K"

    valid, msg = validate_username_format(username)
    if not valid:
        return jsonify({"ok": False, "error": msg}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Password must be at least 4 characters."}), 400

    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return jsonify({"ok": False, "error": f"Username '@{username}' is already taken."}), 409

    cur = conn.execute(
        """INSERT INTO users (username, display_name, password_hash, role, plan_badge, settings_json)
           VALUES (?, ?, ?, 'user', ?, ?)""",
        (username, display_name[:40], hash_password(password), plan_badge[:28], json.dumps(DEFAULT_USER_SETTINGS)),
    )
    user_id = cur.lastrowid
    seed_user_default_media(conn, user_id)
    conn.commit()

    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return create_session_response(row, status=201)


@auth_bp.post("/api/auth/login")
def login() -> Any:
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"ok": False, "error": "Enter both username and password."}), 400

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return jsonify({"ok": False, "error": "Invalid username or password."}), 401

    return create_session_response(row)


@auth_bp.post("/api/auth/logout")
def logout() -> Any:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        conn = get_db()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
    resp = make_response(jsonify({"ok": True}))
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@auth_bp.get("/api/auth/me")
def me() -> Any:
    user = get_current_user()
    if not user:
        return jsonify({"ok": True, "user": None, "userState": None})
    conn = get_db()
    return jsonify({"ok": True, "user": user, "userState": get_user_state(conn, user["id"])})


@auth_bp.put("/api/auth/profile")
@require_auth
def update_profile(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    conn = get_db()
    uid = current_user["id"]

    new_username = (data.get("username") or current_user["username"]).strip()
    valid, msg = validate_username_format(new_username)
    if not valid:
        return jsonify({"ok": False, "error": msg}), 400
    conflict = conn.execute("SELECT id FROM users WHERE username = ? AND id != ?", (new_username, uid)).fetchone()
    if conflict:
        return jsonify({"ok": False, "error": f"Username '@{new_username}' is already taken."}), 409

    display_name = (data.get("displayName") or current_user["displayName"]).strip()[:40] or new_username
    plan_badge = (data.get("planBadge") or current_user["planBadge"]).strip()[:28] or "Premium 4K"
    avatar_url = (data.get("avatarUrl") if "avatarUrl" in data else current_user["avatarUrl"]).strip()
    theme_pref = data.get("themePref") or current_user.get("themePref", "system")
    if theme_pref not in ("dark", "light", "system"):
        theme_pref = "system"

    conn.execute(
        """UPDATE users
           SET username = ?, display_name = ?, plan_badge = ?, avatar_url = ?, theme_pref = ?
           WHERE id = ?""",
        (new_username, display_name, plan_badge, avatar_url, theme_pref, uid),
    )

    new_password = data.get("newPassword") or ""
    if new_password:
        if len(new_password) < 4:
            return jsonify({"ok": False, "error": "New password must be at least 4 characters."}), 400
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), uid))

    conn.commit()
    updated = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"ok": True, "user": serialize_user(updated)})


# ============================================================================
# ADMIN SQL USER DIRECTORY ENDPOINTS (strictly protected by @require_admin)
# ============================================================================

@auth_bp.get("/api/users")
@require_admin
def list_users(current_user: dict[str, Any]) -> Any:
    conn = get_db()
    rows = conn.execute("SELECT * FROM users ORDER BY id ASC").fetchall()
    return jsonify({"ok": True, "users": [serialize_user(r) for r in rows]})


@auth_bp.post("/api/users")
@require_admin
def admin_create_user(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    display_name = (data.get("displayName") or username).strip()[:40]
    password = data.get("password") or "crimson123"
    role = data.get("role") if data.get("role") in ("admin", "user") else "user"
    plan_badge = (data.get("planBadge") or "Premium 4K").strip()[:28]

    valid, msg = validate_username_format(username)
    if not valid:
        return jsonify({"ok": False, "error": msg}), 400
    if len(password) < 4:
        return jsonify({"ok": False, "error": "Password must be at least 4 characters."}), 400

    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return jsonify({"ok": False, "error": f"Username '@{username}' already exists."}), 409

    cur = conn.execute(
        """INSERT INTO users (username, display_name, password_hash, role, plan_badge, settings_json)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (username, display_name, hash_password(password), role, plan_badge, json.dumps(DEFAULT_USER_SETTINGS)),
    )
    seed_user_default_media(conn, cur.lastrowid)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"ok": True, "user": serialize_user(row)}), 201


@auth_bp.put("/api/users/<int:user_id>")
@require_admin
def admin_update_user(user_id: int, current_user: dict[str, Any]) -> Any:
    conn = get_db()
    target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        return jsonify({"ok": False, "error": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or target["username"]).strip()
    valid, msg = validate_username_format(username)
    if not valid:
        return jsonify({"ok": False, "error": msg}), 400
    if conn.execute("SELECT id FROM users WHERE username = ? AND id != ?", (username, user_id)).fetchone():
        return jsonify({"ok": False, "error": f"Username '@{username}' is already taken."}), 409

    role = data.get("role") if data.get("role") in ("admin", "user") else target["role"]
    # Prevent demoting the last remaining admin
    if target["role"] == "admin" and role != "admin":
        admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
        if admin_count <= 1:
            return jsonify({"ok": False, "error": "Cannot demote the only remaining admin account."}), 400

    display_name = (data.get("displayName") or target["display_name"]).strip()[:40]
    plan_badge = (data.get("planBadge") or target["plan_badge"]).strip()[:28]

    conn.execute(
        "UPDATE users SET username = ?, display_name = ?, role = ?, plan_badge = ? WHERE id = ?",
        (username, display_name, role, plan_badge, user_id),
    )
    if data.get("password"):
        if len(data["password"]) < 4:
            return jsonify({"ok": False, "error": "Password must be at least 4 characters."}), 400
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data["password"]), user_id))

    conn.commit()
    updated = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify({"ok": True, "user": serialize_user(updated)})


@auth_bp.delete("/api/users/<int:user_id>")
@require_admin
def admin_delete_user(user_id: int, current_user: dict[str, Any]) -> Any:
    if user_id == current_user["id"]:
        return jsonify({"ok": False, "error": "You cannot delete your currently active admin account."}), 400
    conn = get_db()
    target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        return jsonify({"ok": False, "error": "User not found."}), 404
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return jsonify({"ok": True})
