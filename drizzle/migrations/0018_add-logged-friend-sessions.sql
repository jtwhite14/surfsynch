-- Logged Friend Sessions: opt-in table for including a friend's session in alert matching
CREATE TABLE IF NOT EXISTS "logged_friend_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" uuid NOT NULL REFERENCES "surf_sessions"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "logged_friend_sessions_user_session_idx"
  ON "logged_friend_sessions" ("user_id", "session_id");

ALTER TABLE "public"."logged_friend_sessions" ENABLE ROW LEVEL SECURITY;
