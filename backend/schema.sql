CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'doctor')),
  patient_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  reaction_time NUMERIC(10,2) NOT NULL,
  accuracy NUMERIC(5,2) NOT NULL,
  mistakes INTEGER NOT NULL,
  hesitation_time NUMERIC(10,2) NOT NULL,
  level INTEGER NOT NULL,
  diagnosis TEXT,
  improvement_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user_created
ON game_sessions (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_app_users_role
ON app_users (role);
