-- SQL script to check user password in Supabase
-- Run this in your Supabase SQL Editor

-- Check the user and their password
SELECT id, email, password, created_at, updated_at 
FROM users 
WHERE email = 'admin@scraper.com';

-- If password is not 'admin123', update it:
UPDATE users 
SET password = 'admin123', updated_at = NOW()
WHERE email = 'admin@scraper.com';

-- Verify the password was updated
SELECT id, email, password, created_at, updated_at 
FROM users 
WHERE email = 'admin@scraper.com';


