-- SQL script to create authentication tables in Supabase
-- Run this in your Supabase SQL Editor

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on session_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies (allow service role to access everything)
-- Note: In production, you should create more restrictive policies
-- Drop policies if they exist first, then create them
DROP POLICY IF EXISTS "Service role can access users" ON users;
CREATE POLICY "Service role can access users" ON users
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Service role can access sessions" ON user_sessions;
CREATE POLICY "Service role can access sessions" ON user_sessions
  FOR ALL USING (true);

-- Optional: Insert a default admin user (change password after first login!)
-- Password: admin123 (change this!)
INSERT INTO users (email, password) 
VALUES ('admin@scraper.com', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- Add comment
COMMENT ON TABLE users IS 'User accounts for scraper dashboard authentication';
COMMENT ON TABLE user_sessions IS 'Active user sessions for scraper dashboard';

