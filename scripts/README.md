# CSV Enrichment Scripts

## enrich-trulia-csv.js

This script enriches the Trulia listings CSV file with owner information fetched from the Atom API via the backend API.

### What it does:

1. Reads `trulia_listings.csv` from the project root
2. For each listing, calls `/api/owner-info?address=...&source=trulia` to fetch:
   - `owner_name` - Property owner's name from Atom API
   - `mailing_address` - Owner's mailing address from Atom API
3. Updates the CSV with the fetched data
4. Writes a new file: `trulia_listings_enriched.csv`

### Prerequisites:

- Node.js 18+ (for built-in fetch) OR install node-fetch: `npm install node-fetch`
- Next.js dev server running on `http://localhost:3000` (or set `API_BASE_URL` environment variable)

### Usage:

1. **Start your Next.js dev server:**
   ```bash
   npm run dev
   ```

2. **In a new terminal, run the enrichment script:**
   ```bash
   npm run enrich-trulia
   ```
   
   Or directly:
   ```bash
   node scripts/enrich-trulia-csv.js
   ```

3. **With custom API URL:**
   ```bash
   API_BASE_URL=http://localhost:3000 node scripts/enrich-trulia-csv.js
   ```

### Features:

- ✅ Skips listings that already have owner_name and mailing_address
- ✅ Adds 1 second delay between API calls to avoid rate limiting
- ✅ Handles errors gracefully
- ✅ Shows progress for each listing
- ✅ Preserves all original CSV columns and data

### Output:

The script creates `trulia_listings_enriched.csv` in the project root with:
- All original columns from `trulia_listings.csv`
- Updated `owner_name` column (from Atom API)
- Updated `mailing_address` column (from Atom API)

### Notes:

- The script uses the Atom API key configured for Trulia/Redfin: `00088313f4a127201256b9bf19a2963b`
- Each API call includes `source=trulia` parameter to use the correct Atom API key
- If an API call fails, the script continues with empty values for that listing

