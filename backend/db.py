"""SQLite Database Layer for CRIMSON.

Manages connection pooling per request, executes db/schema.sql + db/seed.sql,
and seeds the catalog from data/catalog.json along with default SQL user accounts.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

import bcrypt
from flask import g

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_DIR = ROOT_DIR / "db"
DB_PATH = DB_DIR / "crimson.db"
SCHEMA_SQL = DB_DIR / "schema.sql"
SEED_SQL = DB_DIR / "seed.sql"
CATALOG_JSON = ROOT_DIR / "data" / "catalog.json"

DEFAULT_WATCHLIST = ["naruto-shippuden", "your-name"]
DEFAULT_DOWNLOADS = [
    {"titleId": "naruto-shippuden", "epId": "naruto-s1-e1", "code": "S1 E1", "size": "485 MB"},
    {"titleId": "your-name", "epId": "yn-movie", "code": "MOVIE", "size": "1.8 GB"},
]
DEFAULT_PROGRESS = {
    "one-piece":        {"season": 1, "epId": "op-s1-e1024", "code": "S1 E1024", "time": 490, "duration": 1440, "progress": 0.34},
    "demon-slayer":     {"season": 4, "epId": "ds-s4-e1",    "code": "S4 E1",    "time": 605, "duration": 1440, "progress": 0.42},
    "steins-gate":      {"season": 1, "epId": "sg-s1-e1",    "code": "S1 E1",    "time": 634, "duration": 1440, "progress": 0.44},
    "attack-on-titan":  {"season": 4, "epId": "aot-s4-e7",   "code": "S4 E7",    "time": 518, "duration": 1440, "progress": 0.36},
    "jujutsu-kaisen":   {"season": 2, "epId": "jjk-s2-e17",  "code": "S2 E17",   "time": 979, "duration": 1440, "progress": 0.68},
}
DEFAULT_USER_SETTINGS = {
    "ambientGlow": True,
    "autoNext": True,
    "audioMode": "SUB",
    "quality": "1080p",
    "reducedMotion": False,
}


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def connect_db() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


def close_db(_exc: BaseException | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def seed_user_default_media(conn: sqlite3.Connection, user_id: int) -> None:
    """Populate initial My List, Continue Watching, and Downloads for a user."""
    for idx, tid in enumerate(DEFAULT_WATCHLIST):
        conn.execute(
            "INSERT OR IGNORE INTO user_watchlist (user_id, title_id, sort_order) VALUES (?, ?, ?)",
            (user_id, tid, idx),
        )
    now_ms = int(time.time() * 1000)
    for idx, (tid, prog) in enumerate(DEFAULT_PROGRESS.items()):
        conn.execute(
            """INSERT OR IGNORE INTO user_watch_progress
               (user_id, title_id, season, ep_id, code, time_sec, duration_sec, progress, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                tid,
                int(prog["season"]),
                prog["epId"],
                prog["code"],
                int(prog["time"]),
                int(prog["duration"]),
                float(prog["progress"]),
                now_ms - idx * 1000,
            ),
        )
    for dl in DEFAULT_DOWNLOADS:
        conn.execute(
            """INSERT OR IGNORE INTO user_downloads
               (user_id, title_id, ep_id, code, size_label)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, dl["titleId"], dl["epId"], dl["code"], dl["size"]),
        )


def seed_catalog_from_json(conn: sqlite3.Connection, catalog_data: dict[str, Any]) -> None:
    """Seed titles, episodes, subtitles, and notifications from catalog dict."""
    for idx, t in enumerate(catalog_data.get("titles", [])):
        conn.execute(
            """INSERT OR REPLACE INTO titles
               (id, title, title_white, title_crimson, type, category, featured, popular_movie,
                badge, tagline, year, rating, duration_label, match_label, maturity,
                genres_json, synopsis, artwork_url, default_ep_json, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                t["id"],
                t["title"],
                t.get("titleWhite") or t["title"],
                t.get("titleCrimson") or "",
                t.get("type", "anime"),
                t.get("category", "series"),
                1 if t.get("featured") else 0,
                1 if t.get("popularMovie") else 0,
                t.get("badge", "Trending Now"),
                t.get("tagline", ""),
                int(t.get("year", 2024)),
                str(t.get("rating", "9.0")),
                t.get("durationLabel", ""),
                t.get("match", "98% Match"),
                t.get("maturity", "TV-14"),
                json.dumps(t.get("genres", [])),
                t.get("synopsis", ""),
                t.get("artworkUrl", ""),
                json.dumps(t.get("defaultEpisode")),
                int(t.get("sortOrder", idx)),
            ),
        )
        seasons = t.get("seasons", {})
        for season_key, ep_list in seasons.items():
            s_num = int(season_key)
            for ep in ep_list:
                conn.execute(
                    """INSERT OR REPLACE INTO episodes
                       (id, title_id, season, number, code, title, duration, synopsis, video_url)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        ep["id"],
                        t["id"],
                        s_num,
                        int(ep.get("number", 1)),
                        ep.get("code", f"S{s_num} E{ep.get('number', 1)}"),
                        ep["title"],
                        int(ep.get("duration", 1440)),
                        ep.get("synopsis", ""),
                        ep.get("videoUrl", ""),
                    ),
                )

    conn.execute("DELETE FROM subtitles")
    for sub in catalog_data.get("subtitles", []):
        conn.execute(
            "INSERT INTO subtitles (start_sec, end_sec, sub_text, dub_text) VALUES (?, ?, ?, ?)",
            (int(sub["start"]), int(sub["end"]), sub["sub"], sub["dub"]),
        )

    for idx, n in enumerate(catalog_data.get("notifications", [])):
        conn.execute(
            """INSERT OR REPLACE INTO notifications
               (id, title_id, season, ep_num, heading, text, time_label, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                n["id"],
                n["titleId"],
                int(n.get("season", 1)),
                int(n.get("epNum", 1)),
                n["heading"],
                n["text"],
                n.get("time", "Just now"),
                idx,
            ),
        )


def init_db(force_reset: bool = False) -> None:
    """Create tables and seed default data if the database is empty or force_reset=True."""
    conn = connect_db()
    try:
        conn.executescript(SCHEMA_SQL.read_text(encoding="utf-8"))
        if force_reset:
            for tbl in ("site_config", "episodes", "titles", "subtitles", "notifications"):
                conn.execute(f"DELETE FROM {tbl}")
        conn.executescript(SEED_SQL.read_text(encoding="utf-8"))

        title_count = conn.execute("SELECT COUNT(*) FROM titles").fetchone()[0]
        if title_count == 0 and CATALOG_JSON.exists():
            catalog_data = json.loads(CATALOG_JSON.read_text(encoding="utf-8"))
            seed_catalog_from_json(conn, catalog_data)

        # Ensure default demo accounts exist
        default_users = [
            ("admin",  "Crimson Admin", "admin123",   "admin", "Studio Director"),
            ("itachi", "Itachi U.",     "crimson123", "user",  "Premium 4K"),
        ]
        for uname, dname, pwd, role, badge in default_users:
            existing = conn.execute("SELECT id FROM users WHERE username = ?", (uname,)).fetchone()
            if not existing:
                cur = conn.execute(
                    """INSERT INTO users (username, display_name, password_hash, role, plan_badge, settings_json)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (uname, dname, hash_password(pwd), role, badge, json.dumps(DEFAULT_USER_SETTINGS)),
                )
                seed_user_default_media(conn, cur.lastrowid)
            elif force_reset:
                seed_user_default_media(conn, existing["id"])

        conn.commit()
    finally:
        conn.close()


def get_site_config(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("SELECT key, value_json FROM site_config").fetchall()
    out: dict[str, Any] = {}
    for r in rows:
        try:
            out[r["key"]] = json.loads(r["value_json"])
        except Exception:
            out[r["key"]] = {}
    return out


def get_full_catalog(conn: sqlite3.Connection) -> dict[str, Any]:
    title_rows = conn.execute("SELECT * FROM titles ORDER BY sort_order ASC, id ASC").fetchall()
    ep_rows = conn.execute("SELECT * FROM episodes ORDER BY season ASC, number ASC").fetchall()

    seasons_by_title: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for ep in ep_rows:
        tid = ep["title_id"]
        skey = str(ep["season"])
        seasons_by_title.setdefault(tid, {}).setdefault(skey, []).append(
            {
                "id": ep["id"],
                "season": ep["season"],
                "number": ep["number"],
                "code": ep["code"],
                "title": ep["title"],
                "duration": ep["duration"],
                "synopsis": ep["synopsis"],
                "videoUrl": ep["video_url"] or "",
            }
        )

    titles: list[dict[str, Any]] = []
    for r in title_rows:
        tid = r["id"]
        seasons = seasons_by_title.get(tid) or {
            "1": [
                {
                    "id": f"{tid}-s1-e1",
                    "season": 1,
                    "number": 1,
                    "code": "MOVIE" if r["type"] == "movie" else "S1 E1",
                    "title": r["title"],
                    "duration": 1440,
                    "synopsis": r["synopsis"],
                    "videoUrl": "",
                }
            ]
        }
        try:
            genres = json.loads(r["genres_json"])
        except Exception:
            genres = ["Anime"]
        try:
            default_ep = json.loads(r["default_ep_json"])
        except Exception:
            default_ep = None

        titles.append(
            {
                "id": tid,
                "title": r["title"],
                "titleWhite": r["title_white"],
                "titleCrimson": r["title_crimson"],
                "type": r["type"],
                "category": r["category"],
                "featured": bool(r["featured"]),
                "popularMovie": bool(r["popular_movie"]),
                "badge": r["badge"],
                "tagline": r["tagline"],
                "year": r["year"],
                "rating": r["rating"],
                "durationLabel": r["duration_label"],
                "match": r["match_label"],
                "maturity": r["maturity"],
                "genres": genres,
                "synopsis": r["synopsis"],
                "artworkUrl": r["artwork_url"] or "",
                "defaultEpisode": default_ep,
                "sortOrder": r["sort_order"],
                "seasons": seasons,
            }
        )

    sub_rows = conn.execute("SELECT id, start_sec, end_sec, sub_text, dub_text FROM subtitles ORDER BY start_sec ASC").fetchall()
    subtitles = [
        {"id": r["id"], "start": r["start_sec"], "end": r["end_sec"], "sub": r["sub_text"], "dub": r["dub_text"]}
        for r in sub_rows
    ]

    notif_rows = conn.execute("SELECT * FROM notifications ORDER BY sort_order ASC, id ASC").fetchall()
    notifications = [
        {
            "id": r["id"],
            "titleId": r["title_id"],
            "season": r["season"],
            "epNum": r["ep_num"],
            "heading": r["heading"],
            "text": r["text"],
            "time": r["time_label"],
            "unread": True,
        }
        for r in notif_rows
    ]

    return {"titles": titles, "subtitles": subtitles, "notifications": notifications}


def get_user_state(conn: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    u = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not u:
        return {}
    watchlist = [
        r["title_id"]
        for r in conn.execute(
            "SELECT title_id FROM user_watchlist WHERE user_id = ? ORDER BY sort_order ASC, added_at DESC",
            (user_id,),
        ).fetchall()
    ]
    progress: dict[str, Any] = {}
    for r in conn.execute("SELECT * FROM user_watch_progress WHERE user_id = ?", (user_id,)).fetchall():
        progress[r["title_id"]] = {
            "season": r["season"],
            "epId": r["ep_id"],
            "code": r["code"],
            "time": r["time_sec"],
            "duration": r["duration_sec"],
            "progress": r["progress"],
            "updatedAt": r["updated_at"],
        }
    downloads = [
        {"titleId": r["title_id"], "epId": r["ep_id"], "code": r["code"], "size": r["size_label"]}
        for r in conn.execute(
            "SELECT * FROM user_downloads WHERE user_id = ? ORDER BY added_at DESC",
            (user_id,),
        ).fetchall()
    ]
    read_notifs = {
        r["notif_id"]
        for r in conn.execute("SELECT notif_id FROM user_notification_reads WHERE user_id = ?", (user_id,)).fetchall()
    }
    try:
        settings = {**DEFAULT_USER_SETTINGS, **json.loads(u["settings_json"] or "{}")}
    except Exception:
        settings = dict(DEFAULT_USER_SETTINGS)

    return {
        "myList": watchlist,
        "watchProgress": progress,
        "downloads": downloads,
        "readNotifIds": list(read_notifs),
        "settings": settings,
        "themePref": u["theme_pref"],
    }
