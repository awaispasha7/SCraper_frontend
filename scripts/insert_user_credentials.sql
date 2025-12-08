-- SQL script to insert/update user credentials in Supabase
-- Run this in your Supabase SQL Editor

-- Step 1: Make sure the users table exists (run create_auth_tables.sql first if needed)
-- CREATE TABLE IF NOT EXISTS users (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   email TEXT UNIQUE NOT NULL,
--   password TEXT NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Step 2: Delete existing user if exists (to reset)
DELETE FROM users WHERE email = 'admin@scraper.com';

-- Step 3: Insert admin user
-- Email: admin@scraper.com
-- Password: admin123
-- IMPORTANT: Email is case-insensitive in the app (converted to lowercase)
INSERT INTO users (email, password) 
VALUES ('admin@scraper.com', 'admin123')
ON CONFLICT (email) 
DO UPDATE SET 
  password = EXCLUDED.password,
  updated_at = NOW();

-- Step 4: Verify the user was created
SELECT id, email, created_at, updated_at FROM users WHERE email = 'admin@scraper.com';

-- Step 5: Check all users (for debugging)
SELECT id, email, created_at FROM users ORDER BY created_at DESC;

-- Optional: Insert additional users
-- INSERT INTO users (email, password) 
-- VALUES ('user@example.com', 'password123')
-- ON CONFLICT (email) DO NOTHING;

