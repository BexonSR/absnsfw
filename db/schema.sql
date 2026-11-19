-- ============================================================================
-- CRIMSON — Relational SQL Schema (SQLite 3)
-- Stores users, sessions, site configuration, anime/movie catalog, episodes,
-- subtitle timeline, notifications, and per-user watchlists/progress/downloads.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. USERS TABLE (unique case-insensitive usernames + bcrypt password hashes)
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name   TEXT    NOT NULL,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  plan_badge     TEXT    NOT NULL DEFAULT 'Premium 4K',
  avatar_url     TEXT    NOT NULL DEFAULT '',
  theme_pref     TEXT    NOT NULL DEFAULT 'system' CHECK (theme_pref IN ('dark', 'light', 'system')),
  settings_json  TEXT    NOT NULL DEFAULT '{}',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);

-- 2. SESSIONS TABLE (persistent login tokens)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  user_agent  TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 3. SITE_CONFIG TABLE (key-value JSON store for whole-website UI customization)
CREATE TABLE IF NOT EXISTS site_config (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT NOT NULL DEFAULT 'system'
);

-- 4. TITLES TABLE (Anime series & theatrical movies)
CREATE TABLE IF NOT EXISTS titles (
  id              TEXT    PRIMARY KEY,
  title           TEXT    NOT NULL,
  title_white     TEXT    NOT NULL,
  title_crimson   TEXT    NOT NULL,
  type            TEXT    NOT NULL DEFAULT 'anime' CHECK (type IN ('anime', 'movie')),
  category        TEXT    NOT NULL DEFAULT 'series' CHECK (category IN ('series', 'movies')),
  featured        INTEGER NOT NULL DEFAULT 0,
  popular_movie   INTEGER NOT NULL DEFAULT 0,
  badge           TEXT    NOT NULL DEFAULT 'Trending Now',
  tagline         TEXT    NOT NULL DEFAULT '',
  year            INTEGER NOT NULL DEFAULT 2024,
  rating          TEXT    NOT NULL DEFAULT '9.0',
  duration_label  TEXT    NOT NULL DEFAULT '',
  match_label     TEXT    NOT NULL DEFAULT '98% Match',
  maturity        TEXT    NOT NULL DEFAULT 'TV-14',
  genres_json     TEXT    NOT NULL DEFAULT '[]',
  synopsis        TEXT    NOT NULL DEFAULT '',
  artwork_url     TEXT    NOT NULL DEFAULT '',
  default_ep_json TEXT    NOT NULL DEFAULT 'null',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_titles_sort ON titles(sort_order ASC, id ASC);

-- 5. EPISODES TABLE (Seasons & episodes belonging to a title)
CREATE TABLE IF NOT EXISTS episodes (
  id          TEXT    PRIMARY KEY,
  title_id    TEXT    NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season      INTEGER NOT NULL DEFAULT 1,
  number      INTEGER NOT NULL DEFAULT 1,
  code        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  duration    INTEGER NOT NULL DEFAULT 1440,
  synopsis    TEXT    NOT NULL DEFAULT '',
  video_url   TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_episodes_title_season ON episodes(title_id, season ASC, number ASC);

-- 6. SUBTITLES TABLE (Canvas video player timed SUB & DUB lines)
CREATE TABLE IF NOT EXISTS subtitles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  start_sec INTEGER NOT NULL,
  end_sec   INTEGER NOT NULL,
  sub_text  TEXT    NOT NULL,
  dub_text  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtitles_start ON subtitles(start_sec ASC);

-- 7. NOTIFICATIONS TABLE (Topbar bell dropdown alerts)
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT    PRIMARY KEY,
  title_id   TEXT    NOT NULL,
  season     INTEGER NOT NULL DEFAULT 1,
  ep_num     INTEGER NOT NULL DEFAULT 1,
  heading    TEXT    NOT NULL,
  text       TEXT    NOT NULL,
  time_label TEXT    NOT NULL DEFAULT 'Just now',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 8. USER_WATCHLIST TABLE (Per-user "My List" saved titles)
CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   TEXT    NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, title_id)
);

-- 9. USER_WATCH_PROGRESS TABLE (Per-user "Continue Watching" timestamps)
CREATE TABLE IF NOT EXISTS user_watch_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id     TEXT    NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season       INTEGER NOT NULL DEFAULT 1,
  ep_id        TEXT    NOT NULL,
  code         TEXT    NOT NULL,
  time_sec     INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 1440,
  progress     REAL    NOT NULL DEFAULT 0.0,
  updated_at   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, title_id)
);

-- 10. USER_DOWNLOADS TABLE (Per-user saved offline episodes)
CREATE TABLE IF NOT EXISTS user_downloads (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   TEXT    NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  ep_id      TEXT    NOT NULL,
  code       TEXT    NOT NULL,
  size_label TEXT    NOT NULL DEFAULT '420 MB',
  added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, ep_id)
);

-- 11. USER_NOTIFICATION_READS TABLE (Per-user read notification state)
CREATE TABLE IF NOT EXISTS user_notification_reads (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notif_id TEXT    NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, notif_id)
);
