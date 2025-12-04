-- SQL script to reset trulia_listings ID sequence to start from 1
-- Run this in your Supabase SQL Editor to reset the ID counter

-- Option 1: Reset sequence to start from 1 (keeps existing data, but next insert will use ID 1)
-- This will cause conflicts if there are existing rows, so use Option 2 if you want to start fresh

-- Option 2: Delete all data and reset sequence (RECOMMENDED if you want clean IDs starting from 1)
-- Uncomment the following lines if you want to delete all existing data first:
-- DELETE FROM trulia_listings;

-- Reset the sequence to start from 1
-- Find the sequence name (usually: tablename_id_seq)
SELECT setval('trulia_listings_id_seq', 1, false);

-- If the above doesn't work, try finding the sequence name:
-- SELECT pg_get_serial_sequence('trulia_listings', 'id');

-- Alternative: Reset to start from the next available ID (if you want to keep existing data)
-- This will set the sequence to the maximum ID + 1
-- SELECT setval('trulia_listings_id_seq', COALESCE((SELECT MAX(id) FROM trulia_listings), 0) + 1, false);


