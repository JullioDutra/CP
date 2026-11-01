CREATE SCHEMA IF NOT EXISTS trama;
REVOKE ALL ON SCHEMA trama FROM PUBLIC, anon, authenticated;
SET search_path = trama;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL,
      created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
      room TEXT, players_count BIGINT NOT NULL, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_players (
      match_id TEXT NOT NULL REFERENCES matches(id), profile_id TEXT, name TEXT NOT NULL, avatar TEXT NOT NULL,
      score BIGINT NOT NULL, place BIGINT NOT NULL, words BIGINT NOT NULL DEFAULT 0,
      unique_words BIGINT NOT NULL DEFAULT 0, longest TEXT, created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mp_rank ON match_players(created_at, score);
    CREATE INDEX IF NOT EXISTS mp_profile ON match_players(profile_id, created_at);
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, mode TEXT NOT NULL, variant TEXT NOT NULL,
      data TEXT NOT NULL, started_at BIGINT NOT NULL, duration BIGINT NOT NULL, used BIGINT NOT NULL DEFAULT 0, ranked BIGINT NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS tk_profile ON tickets(profile_id, mode, variant);
    CREATE TABLE IF NOT EXISTS ratings (
      profile_id TEXT NOT NULL, season TEXT NOT NULL, rating DOUBLE PRECISION NOT NULL, peak DOUBLE PRECISION NOT NULL, games BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (profile_id, season)
    );
    CREATE TABLE IF NOT EXISTS achievements (
      profile_id TEXT NOT NULL, key TEXT NOT NULL, at BIGINT NOT NULL, PRIMARY KEY (profile_id, key)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, reporter_id TEXT, reported_id TEXT, reported_name TEXT, room TEXT, reason TEXT, at BIGINT NOT NULL
    );

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS backend_keys (hash TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state JSONB NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, code TEXT, player_id TEXT, is_tv BOOLEAN NOT NULL DEFAULT false, seen BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS conn_code ON connections(code);
CREATE INDEX IF NOT EXISTS conn_seen ON connections(seen);
CREATE INDEX IF NOT EXISTS room_updated ON rooms(updated_at);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at BIGINT NOT NULL);
ALTER TABLE backend_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA trama FROM PUBLIC, anon, authenticated;
