-- SQL script to create addresses table in Supabase
-- Run this in your Supabase SQL Editor

-- Create addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  owner_name TEXT,
  mailing_address TEXT,
  emails TEXT,
  phones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_addresses_address ON addresses(address);
CREATE INDEX IF NOT EXISTS idx_addresses_city ON addresses(city);
CREATE INDEX IF NOT EXISTS idx_addresses_state ON addresses(state);
CREATE INDEX IF NOT EXISTS idx_addresses_zip ON addresses(zip);
CREATE INDEX IF NOT EXISTS idx_addresses_owner_name ON addresses(owner_name);

-- Create unique constraint on address to prevent duplicates
-- Note: This might need adjustment if you have duplicate addresses
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_unique ON addresses(address, city, state, zip);

-- Enable Row Level Security (RLS)
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to access everything
DROP POLICY IF EXISTS "Service role can access addresses" ON addresses;
CREATE POLICY "Service role can access addresses" ON addresses
  FOR ALL USING (true);

-- Add comments to document the table
COMMENT ON TABLE addresses IS 'Property addresses with owner information';
COMMENT ON COLUMN addresses.address IS 'Street address';
COMMENT ON COLUMN addresses.city IS 'City name';
COMMENT ON COLUMN addresses.state IS 'State abbreviation';
COMMENT ON COLUMN addresses.zip IS 'ZIP code';
COMMENT ON COLUMN addresses.owner_name IS 'Property owner name';
COMMENT ON COLUMN addresses.mailing_address IS 'Owner mailing address';
COMMENT ON COLUMN addresses.emails IS 'Owner email addresses (comma-separated)';
COMMENT ON COLUMN addresses.phones IS 'Owner phone numbers (comma-separated)';



