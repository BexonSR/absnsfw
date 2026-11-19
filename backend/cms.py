"""Visual Website Studio (CMS) & Per-User State Sync Endpoints."""
from __future__ import annotations

import json
import re
from typing import Any

from flask import Blueprint, jsonify, request

from .auth import get_current_user, require_admin, require_auth
from .db import (
    get_db,
    get_full_catalog,
    get_site_config,
    get_user_state,
    init_db,
    seed_catalog_from_json,
)

cms_bp = Blueprint("cms", __name__)

SLUG_RE = re.compile(r"[^a-z0-9-]+")


def slugify(text: str) -> str:
    s = SLUG_RE.sub("-", (text or "").strip().lower()).strip("-")
    return s or "new-title"


@cms_bp.get("/api/bootstrap")
def bootstrap() -> Any:
    conn = get_db()
    user = get_current_user()
    user_state = get_user_state(conn, user["id"]) if user else None
    return jsonify(
        {
            "ok": True,
            "siteConfig": get_site_config(conn),
            "catalog": get_full_catalog(conn),
            "user": user,
            "userState": user_state,
        }
    )


@cms_bp.put("/api/user/state")
@require_auth
def save_user_state(current_user: dict[str, Any]) -> Any:
    """Persist the logged-in user's watchlist, progress, downloads, settings, and read notifications to SQL."""
    data = request.get_json(silent=True) or {}
    conn = get_db()
    uid = current_user["id"]

    # Valid title IDs in SQL
    valid_tids = {r["id"] for r in conn.execute("SELECT id FROM titles").fetchall()}

    if "myList" in data and isinstance(data["myList"], list):
        conn.execute("DELETE FROM user_watchlist WHERE user_id = ?", (uid,))
        for idx, tid in enumerate(data["myList"]):
            if tid in valid_tids:
                conn.execute(
                    "INSERT OR IGNORE INTO user_watchlist (user_id, title_id, sort_order) VALUES (?, ?, ?)",
                    (uid, tid, idx),
                )

    if "watchProgress" in data and isinstance(data["watchProgress"], dict):
        conn.execute("DELETE FROM user_watch_progress WHERE user_id = ?", (uid,))
        for tid, prog in data["watchProgress"].items():
            if tid in valid_tids and isinstance(prog, dict):
                conn.execute(
                    """INSERT OR REPLACE INTO user_watch_progress
                       (user_id, title_id, season, ep_id, code, time_sec, duration_sec, progress, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        uid,
                        tid,
                        int(prog.get("season", 1)),
                        str(prog.get("epId", f"{tid}-s1-e1")),
                        str(prog.get("code", "S1 E1")),
                        int(prog.get("time", 0)),
                        int(prog.get("duration", 1440)),
                        float(prog.get("progress", 0.0)),
                        int(prog.get("updatedAt", 0)),
                    ),
                )

    if "downloads" in data and isinstance(data["downloads"], list):
        conn.execute("DELETE FROM user_downloads WHERE user_id = ?", (uid,))
        for dl in data["downloads"]:
            tid = dl.get("titleId") if isinstance(dl, dict) else None
            if tid in valid_tids:
                conn.execute(
                    """INSERT OR REPLACE INTO user_downloads
                       (user_id, title_id, ep_id, code, size_label)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        uid,
                        tid,
                        str(dl.get("epId", f"{tid}-s1-e1")),
                        str(dl.get("code", "S1 E1")),
                        str(dl.get("size", "420 MB")),
                    ),
                )

    if "readNotifIds" in data and isinstance(data["readNotifIds"], list):
        valid_nids = {r["id"] for r in conn.execute("SELECT id FROM notifications").fetchall()}
        conn.execute("DELETE FROM user_notification_reads WHERE user_id = ?", (uid,))
        for nid in data["readNotifIds"]:
            if nid in valid_nids:
                conn.execute(
                    "INSERT OR IGNORE INTO user_notification_reads (user_id, notif_id) VALUES (?, ?)",
                    (uid, nid),
                )

    if "settings" in data and isinstance(data["settings"], dict):
        conn.execute(
            "UPDATE users SET settings_json = ? WHERE id = ?",
            (json.dumps(data["settings"]), uid),
        )

    if "themePref" in data and data["themePref"] in ("dark", "light", "system"):
        conn.execute(
            "UPDATE users SET theme_pref = ? WHERE id = ?",
            (data["themePref"], uid),
        )

    conn.commit()
    return jsonify({"ok": True, "userState": get_user_state(conn, uid)})


# ============================================================================
# ADMIN VISUAL WEBSITE STUDIO ENDPOINTS (strictly protected by @require_admin)
# ============================================================================

@cms_bp.put("/api/cms/config")
@require_admin
def update_site_config(current_user: dict[str, Any]) -> Any:
    """Update one or more keys in site_config (brand, navigation, sections, theme, player)."""
    data = request.get_json(silent=True) or {}
    conn = get_db()
    existing = get_site_config(conn)

    allowed_keys = {"brand", "navigation", "sections", "theme", "player", "footer"}
    for key, val in data.items():
        if key not in allowed_keys:
            continue
        if isinstance(val, dict) and isinstance(existing.get(key), dict):
            merged = {**existing[key], **val}
        else:
            merged = val
        conn.execute(
            """INSERT OR REPLACE INTO site_config (key, value_json, updated_at, updated_by)
               VALUES (?, ?, datetime('now'), ?)""",
            (key, json.dumps(merged), current_user["username"]),
        )

    conn.commit()
    return jsonify({"ok": True, "siteConfig": get_site_config(conn)})


def _upsert_title_from_payload(conn: Any, payload: dict[str, Any], is_new: bool = False) -> str:
    raw_id = (payload.get("id") or "").strip()
    title_str = (payload.get("title") or "Untitled Anime").strip()
    tid = slugify(raw_id or title_str)

    if is_new:
        base = tid
        counter = 2
        while conn.execute("SELECT 1 FROM titles WHERE id = ?", (tid,)).fetchone():
            tid = f"{base}-{counter}"
            counter += 1

    parts = title_str.split(" ", 1)
    title_white = (payload.get("titleWhite") if "titleWhite" in payload else parts[0]).strip() or title_str
    title_crimson = (payload.get("titleCrimson") if "titleCrimson" in payload else (parts[1] if len(parts) > 1 else "")).strip()

    ttype = payload.get("type") if payload.get("type") in ("anime", "movie") else "anime"
    category = payload.get("category") if payload.get("category") in ("series", "movies") else ("movies" if ttype == "movie" else "series")

    genres = payload.get("genres")
    if isinstance(genres, str):
        genres = [g.strip() for g in genres.split(",") if g.strip()]
    elif not isinstance(genres, list):
        genres = ["Action", "Anime"]

    row = conn.execute("SELECT sort_order, default_ep_json FROM titles WHERE id = ?", (tid,)).fetchone()
    max_order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM titles").fetchone()[0]
    sort_order = int(payload.get("sortOrder", row["sort_order"] if row else max_order))
    default_ep_json = json.dumps(payload["defaultEpisode"]) if "defaultEpisode" in payload else (row["default_ep_json"] if row else "null")

    conn.execute(
        """INSERT OR REPLACE INTO titles
           (id, title, title_white, title_crimson, type, category, featured, popular_movie,
            badge, tagline, year, rating, duration_label, match_label, maturity,
            genres_json, synopsis, artwork_url, default_ep_json, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
        (
            tid,
            title_str,
            title_white,
            title_crimson,
            ttype,
            category,
            1 if payload.get("featured") else 0,
            1 if payload.get("popularMovie") else 0,
            (payload.get("badge") or "Trending Now").strip(),
            (payload.get("tagline") or payload.get("synopsis") or "").strip(),
            int(payload.get("year") or 2024),
            str(payload.get("rating") or "9.0").strip(),
            (payload.get("durationLabel") or "").strip(),
            (payload.get("match") or "98% Match").strip(),
            (payload.get("maturity") or "TV-14").strip(),
            json.dumps(genres),
            (payload.get("synopsis") or "").strip(),
            (payload.get("artworkUrl") or "").strip(),
            default_ep_json,
            sort_order,
        ),
    )

    if isinstance(payload.get("seasons"), dict):
        _replace_title_episodes(conn, tid, payload["seasons"], ttype, title_str, payload.get("synopsis", ""))
    elif is_new:
        _replace_title_episodes(conn, tid, {}, ttype, title_str, payload.get("synopsis", ""))

    return tid


def _replace_title_episodes(
    conn: Any,
    tid: str,
    seasons_dict: dict[str, Any],
    ttype: str = "anime",
    fallback_title: str = "Episode 1",
    fallback_synopsis: str = "",
) -> None:
    conn.execute("DELETE FROM episodes WHERE title_id = ?", (tid,))
    inserted = 0
    for s_key, ep_list in seasons_dict.items():
        try:
            s_num = max(1, int(s_key))
        except Exception:
            s_num = 1
        if not isinstance(ep_list, list):
            continue
        for idx, ep in enumerate(ep_list):
            if not isinstance(ep, dict):
                continue
            ep_num = int(ep.get("number") or (idx + 1))
            ep_id = (ep.get("id") or f"{tid}-s{s_num}-e{ep_num}").strip()
            # Ensure episode id is unique across table
            if conn.execute("SELECT 1 FROM episodes WHERE id = ?", (ep_id,)).fetchone():
                ep_id = f"{tid}-s{s_num}-e{ep_num}-{idx + 1}"
            code = (ep.get("code") or ("MOVIE" if ttype == "movie" else f"S{s_num} E{ep_num}")).strip()
            conn.execute(
                """INSERT INTO episodes
                   (id, title_id, season, number, code, title, duration, synopsis, video_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    ep_id,
                    tid,
                    s_num,
                    ep_num,
                    code,
                    (ep.get("title") or f"Episode {ep_num}").strip(),
                    max(30, int(ep.get("duration") or (7200 if ttype == "movie" else 1440))),
                    (ep.get("synopsis") or fallback_synopsis).strip(),
                    (ep.get("videoUrl") or "").strip(),
                ),
            )
            inserted += 1

    if inserted == 0:
        conn.execute(
            """INSERT INTO episodes (id, title_id, season, number, code, title, duration, synopsis, video_url)
               VALUES (?, ?, 1, 1, ?, ?, ?, ?, '')""",
            (
                f"{tid}-s1-e1",
                tid,
                "MOVIE" if ttype == "movie" else "S1 E1",
                fallback_title if ttype == "movie" else "Episode 1: Awakening",
                7200 if ttype == "movie" else 1440,
                fallback_synopsis,
            ),
        )


@cms_bp.post("/api/cms/titles")
@require_admin
def create_title(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    conn = get_db()
    tid = _upsert_title_from_payload(conn, data, is_new=True)
    conn.commit()
    return jsonify({"ok": True, "titleId": tid, "catalog": get_full_catalog(conn)}), 201


@cms_bp.put("/api/cms/titles/<string:title_id>")
@require_admin
def update_title(title_id: str, current_user: dict[str, Any]) -> Any:
    conn = get_db()
    existing = conn.execute("SELECT * FROM titles WHERE id = ?", (title_id,)).fetchone()
    if not existing:
        return jsonify({"ok": False, "error": f"Title '{title_id}' not found."}), 404

    data = request.get_json(silent=True) or {}
    data["id"] = title_id
    _upsert_title_from_payload(conn, data, is_new=False)
    conn.commit()
    return jsonify({"ok": True, "titleId": title_id, "catalog": get_full_catalog(conn)})


@cms_bp.delete("/api/cms/titles/<string:title_id>")
@require_admin
def delete_title(title_id: str, current_user: dict[str, Any]) -> Any:
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM titles").fetchone()[0]
    if total <= 1:
        return jsonify({"ok": False, "error": "Cannot delete the last remaining title in the catalog."}), 400
    conn.execute("DELETE FROM titles WHERE id = ?", (title_id,))
    conn.commit()
    return jsonify({"ok": True, "catalog": get_full_catalog(conn)})


@cms_bp.post("/api/cms/titles/reorder")
@require_admin
def reorder_titles(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    ids = data.get("ids") or []
    conn = get_db()
    for idx, tid in enumerate(ids):
        conn.execute("UPDATE titles SET sort_order = ? WHERE id = ?", (idx, tid))
    conn.commit()
    return jsonify({"ok": True, "catalog": get_full_catalog(conn)})


@cms_bp.put("/api/cms/titles/<string:title_id>/episodes")
@require_admin
def update_title_episodes(title_id: str, current_user: dict[str, Any]) -> Any:
    conn = get_db()
    t = conn.execute("SELECT * FROM titles WHERE id = ?", (title_id,)).fetchone()
    if not t:
        return jsonify({"ok": False, "error": "Title not found."}), 404

    data = request.get_json(silent=True) or {}
    seasons = data.get("seasons")
    if not isinstance(seasons, dict):
        return jsonify({"ok": False, "error": "Expected 'seasons' object."}), 400

    _replace_title_episodes(conn, title_id, seasons, t["type"], t["title"], t["synopsis"])
    conn.commit()
    return jsonify({"ok": True, "catalog": get_full_catalog(conn)})


@cms_bp.put("/api/cms/subtitles")
@require_admin
def update_subtitles(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    rows = data.get("subtitles")
    if not isinstance(rows, list):
        return jsonify({"ok": False, "error": "Expected 'subtitles' array."}), 400

    conn = get_db()
    conn.execute("DELETE FROM subtitles")
    for item in rows:
        if not isinstance(item, dict):
            continue
        start_s = max(0, int(item.get("start", 0)))
        end_s = max(start_s + 1, int(item.get("end", start_s + 10)))
        sub_t = (item.get("sub") or "").strip()
        dub_t = (item.get("dub") or sub_t).strip()
        if sub_t or dub_t:
            conn.execute(
                "INSERT INTO subtitles (start_sec, end_sec, sub_text, dub_text) VALUES (?, ?, ?, ?)",
                (start_s, end_s, sub_t, dub_t),
            )
    conn.commit()
    return jsonify({"ok": True, "catalog": get_full_catalog(conn)})


@cms_bp.put("/api/cms/notifications")
@require_admin
def update_notifications(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    rows = data.get("notifications")
    if not isinstance(rows, list):
        return jsonify({"ok": False, "error": "Expected 'notifications' array."}), 400

    conn = get_db()
    conn.execute("DELETE FROM notifications")
    fallback_tid_row = conn.execute("SELECT id FROM titles ORDER BY sort_order ASC LIMIT 1").fetchone()
    fallback_tid = fallback_tid_row["id"] if fallback_tid_row else "naruto-shippuden"

    for idx, n in enumerate(rows):
        if not isinstance(n, dict):
            continue
        nid = (n.get("id") or f"n{idx + 1}").strip()
        tid = (n.get("titleId") or fallback_tid).strip()
        heading = (n.get("heading") or "New Episode").strip()
        text = (n.get("text") or "").strip()
        time_lbl = (n.get("time") or "Just now").strip()
        conn.execute(
            """INSERT OR REPLACE INTO notifications
               (id, title_id, season, ep_num, heading, text, time_label, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (nid, tid, int(n.get("season", 1)), int(n.get("epNum", 1)), heading, text, time_lbl, idx),
        )
    conn.commit()
    return jsonify({"ok": True, "catalog": get_full_catalog(conn)})


@cms_bp.get("/api/cms/export")
@require_admin
def export_snapshot(current_user: dict[str, Any]) -> Any:
    conn = get_db()
    return jsonify(
        {
            "ok": True,
            "version": 1,
            "siteConfig": get_site_config(conn),
            "catalog": get_full_catalog(conn),
        }
    )


@cms_bp.post("/api/cms/import")
@require_admin
def import_snapshot(current_user: dict[str, Any]) -> Any:
    data = request.get_json(silent=True) or {}
    conn = get_db()

    site_cfg = data.get("siteConfig")
    if isinstance(site_cfg, dict):
        for k, v in site_cfg.items():
            conn.execute(
                """INSERT OR REPLACE INTO site_config (key, value_json, updated_at, updated_by)
                   VALUES (?, ?, datetime('now'), ?)""",
                (k, json.dumps(v), current_user["username"]),
            )

    cat = data.get("catalog")
    if isinstance(cat, dict) and isinstance(cat.get("titles"), list):
        conn.execute("DELETE FROM episodes")
        conn.execute("DELETE FROM titles")
        conn.execute("DELETE FROM notifications")
        seed_catalog_from_json(conn, cat)

    conn.commit()
    return jsonify(
        {
            "ok": True,
            "siteConfig": get_site_config(conn),
            "catalog": get_full_catalog(conn),
        }
    )


@cms_bp.post("/api/cms/reset")
@require_admin
def reset_site(current_user: dict[str, Any]) -> Any:
    init_db(force_reset=True)
    conn = get_db()
    return jsonify(
        {
            "ok": True,
            "siteConfig": get_site_config(conn),
            "catalog": get_full_catalog(conn),
        }
    )
