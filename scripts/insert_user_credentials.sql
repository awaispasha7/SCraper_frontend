-- SQL script to insert/update user credentials in Supabase
-- Run this in your Supabase SQL Editor

-- Delete existing user if exists (to reset)
DELETE FROM users WHERE email = 'admin@scraper.com';

-- Insert admin user
-- Email: admin@scraper.com
-- Password: admin123
INSERT INTO users (email, password) 
VALUES ('admin@scraper.com', 'admin123')
ON CONFLICT (email) 
DO UPDATE SET 
  password = EXCLUDED.password,
  updated_at = NOW();

-- Verify the user was created
SELECT id, email, created_at FROM users WHERE email = 'admin@scraper.com';

-- Optional: Insert additional users
-- INSERT INTO users (email, password) 
-- VALUES ('user@example.com', 'password123')
-- ON CONFLICT (email) DO NOTHING;

