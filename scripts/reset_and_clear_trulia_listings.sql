-- SQL script to completely clear trulia_listings table and reset ID sequence to 1
-- WARNING: This will DELETE ALL DATA in the trulia_listings table!
-- Run this in your Supabase SQL Editor if you want to start fresh with IDs from 1

-- Delete all existing data
DELETE FROM trulia_listings;

-- Reset the sequence to start from 1
-- Try the standard sequence name first
DO $$
BEGIN
    -- Reset sequence to 1
    PERFORM setval('trulia_listings_id_seq', 1, false);
EXCEPTION
    WHEN OTHERS THEN
        -- If sequence name is different, find and reset it
        PERFORM setval(
            pg_get_serial_sequence('trulia_listings', 'id'),
            1,
            false
        );
END $$;

-- Verify the sequence is reset
SELECT setval('trulia_listings_id_seq', 1, false);

-- Check current sequence value (should return 1)
SELECT currval('trulia_listings_id_seq');


