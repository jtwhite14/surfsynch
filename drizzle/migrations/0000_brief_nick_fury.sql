-- SurfSync Initial Migration
-- Run this SQL in your Supabase SQL editor to create all tables

-- Users table (extended from NextAuth defaults)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  "emailVerified" TIMESTAMP,
  image TEXT,
  google_refresh_token TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- NextAuth Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type VARCHAR(255),
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  PRIMARY KEY (provider, "providerAccountId")
);

-- NextAuth Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  "sessionToken" VARCHAR(255) PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMP NOT NULL
);

-- NextAuth Verification Tokens table
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires TIMESTAMP NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Surf Spots table
CREATE TABLE IF NOT EXISTS surf_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Surf Sessions table
CREATE TABLE IF NOT EXISTS surf_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES surf_spots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Session Conditions table (captured at session time)
CREATE TABLE IF NOT EXISTS session_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES surf_sessions(id) ON DELETE CASCADE UNIQUE,
  wave_height DECIMAL(5, 2),
  wave_period DECIMAL(5, 2),
  wave_direction DECIMAL(5, 2),
  primary_swell_height DECIMAL(5, 2),
  primary_swell_period DECIMAL(5, 2),
  primary_swell_direction DECIMAL(5, 2),
  secondary_swell_height DECIMAL(5, 2),
  secondary_swell_period DECIMAL(5, 2),
  secondary_swell_direction DECIMAL(5, 2),
  wind_speed DECIMAL(5, 2),
  wind_direction DECIMAL(5, 2),
  sea_surface_temp DECIMAL(5, 2),
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Spot Forecasts table (cached forecasts per spot)
CREATE TABLE IF NOT EXISTS spot_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES surf_spots(id) ON DELETE CASCADE,
  forecast_data JSONB NOT NULL,
  fetched_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_surf_spots_user ON surf_spots(user_id);
CREATE INDEX IF NOT EXISTS idx_surf_sessions_user ON surf_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_surf_sessions_spot ON surf_sessions(spot_id);
CREATE INDEX IF NOT EXISTS idx_surf_sessions_date ON surf_sessions(date DESC);
CREATE INDEX IF NOT EXISTS idx_session_conditions_session ON session_conditions(session_id);
CREATE INDEX IF NOT EXISTS idx_spot_forecasts_spot ON spot_forecasts(spot_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts("userId");
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions("userId");

-- Note: Supabase Row Level Security (RLS) policies should be configured
-- based on your authentication setup. The policies below are examples
-- and may need adjustment based on how NextAuth handles user IDs.

-- Create Supabase Storage bucket for session photos
-- Run this in Supabase Dashboard > Storage > Create new bucket:
-- Bucket name: session-photos
-- Public bucket: Yes (for easy photo URLs)
