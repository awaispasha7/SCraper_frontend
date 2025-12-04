-- SQL script to verify user setup in Supabase
-- Run this in your Supabase SQL Editor to check if everything is set up correctly

-- Step 1: Check if users table exists
SELECT 
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'users'
  ) AS users_table_exists;

-- Step 2: Check if user_sessions table exists
SELECT 
  EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_sessions'
  ) AS sessions_table_exists;

-- Step 3: Check all users in the database
SELECT id, email, created_at, updated_at 
FROM users 
ORDER BY created_at DESC;

-- Step 4: Check if admin user exists specifically
SELECT id, email, created_at 
FROM users 
WHERE email = 'admin@scraper.com';

-- Step 5: If admin user doesn't exist, create it
-- Uncomment and run this if Step 4 returns no rows:
/*
INSERT INTO users (email, password) 
VALUES ('admin@scraper.com', 'admin123')
ON CONFLICT (email) 
DO UPDATE SET 
  password = EXCLUDED.password,
  updated_at = NOW();

-- Verify it was created
SELECT id, email, created_at FROM users WHERE email = 'admin@scraper.com';
*/

-- Step 6: Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('users', 'user_sessions');

-- Step 7: Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('users', 'user_sessions');


