-- SQL script to add emails and phones columns to redfin_listings table
-- Run this in your Supabase SQL Editor if the columns don't exist

-- Add emails column (text type to store comma-separated or newline-separated emails)
ALTER TABLE redfin_listings 
ADD COLUMN IF NOT EXISTS emails TEXT;

-- Add phones column (text type to store comma-separated or newline-separated phones)
ALTER TABLE redfin_listings 
ADD COLUMN IF NOT EXISTS phones TEXT;

-- Optional: Add comments to document the columns
COMMENT ON COLUMN redfin_listings.emails IS 'Owner email addresses (comma or newline separated)';
COMMENT ON COLUMN redfin_listings.phones IS 'Owner phone numbers (comma or newline separated)';

