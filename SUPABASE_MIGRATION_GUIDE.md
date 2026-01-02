# Supabase Migration Guide

## Overview
This guide explains how to migrate from the old Supabase instance to the new one.

## New Supabase Credentials

### Frontend Environment Variables (.env.local)
Create or update `SCraper_frontend/.env.local`:

```env
# Supabase URL
NEXT_PUBLIC_SUPABASE_URL=https://jpojoxidogqrqeahdxmu.supabase.co

# Supabase Publishable Key (anon key)
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_I8MbJxM6pE2Nwf2DyAmFoA_GHU5PGfn

# Optional: Service Role Key (for server-side operations)
# Get this from Supabase Dashboard → Settings → API → service_role key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Backend Environment Variables
Update your backend `.env` file or Railway environment variables:

```env
# Supabase URL
SUPABASE_URL=https://jpojoxidogqrqeahdxmu.supabase.co

# Supabase Service Role Key (REQUIRED for backend)
# Get this from Supabase Dashboard → Settings → API → service_role key
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Alternative variable name (also supported)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## How to Get Service Role Key

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `jpojoxidogqrqeahdxmu`
3. Navigate to **Settings** → **API**
4. Copy the **service_role key** (NOT the anon/publishable key)
   - This key has elevated permissions and should ONLY be used on the backend
   - Never expose it in frontend code or commit it to git

## Database Connection String

For direct database access:

```
postgresql://postgres:[YOUR-PASSWORD]@db.jpojoxidogqrqeahdxmu.supabase.co:5432/postgres
```

**Note:** Replace `[YOUR-PASSWORD]` with your actual database password (found in Supabase Dashboard → Settings → Database)

## Migration Steps

### 1. Update Frontend Environment Variables

1. Create/update `SCraper_frontend/.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://jpojoxidogqrqeahdxmu.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_I8MbJxM6pE2Nwf2DyAmFoA_GHU5PGfn
   ```

2. Restart your Next.js dev server:
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart
   npm run dev
   ```

### 2. Update Backend Environment Variables

#### For Local Development:
Create/update `Scraper_backend/.env`:
```env
SUPABASE_URL=https://jpojoxidogqrqeahdxmu.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

#### For Railway Deployment:
1. Go to Railway Dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Update or add:
   - `SUPABASE_URL` = `https://jpojoxidogqrqeahdxmu.supabase.co`
   - `SUPABASE_SERVICE_KEY` = `your_service_role_key_here`
5. Redeploy the service

### 3. Verify Schema Compatibility

The new database schema matches the expected structure. All tables are present:
- ✅ `listings`
- ✅ `trulia_listings`
- ✅ `redfin_listings`
- ✅ `zillow_fsbo_listings`
- ✅ `zillow_frbo_listings`
- ✅ `hotpads_listings`
- ✅ `apartments_frbo_chicago`
- ✅ `property_owners`
- ✅ `property_owner_enrichment_state`
- ✅ `addresses`
- ✅ `scrape_metadata`
- ✅ `scrape_state`

### 4. Test the Connection

#### Frontend:
1. Start the dev server: `npm run dev`
2. Open the browser console
3. Check for any Supabase connection errors
4. Try logging in to verify authentication works

#### Backend:
1. Test the API server: `python api_server.py`
2. Check logs for Supabase connection status
3. Try triggering a scraper to verify database writes work

## Important Notes

1. **Service Role Key**: The backend REQUIRES the service_role key (not the publishable key) because it needs to write to the database.

2. **Key Format**: The new Supabase uses keys starting with `sb_publishable_` (publishable/anon key) and `sb_service_role_` (service role key). This is the new format and is compatible with the Supabase client libraries.

3. **Authentication**: If you have existing users, you'll need to recreate them in the new Supabase instance OR migrate them using Supabase's migration tools.

4. **Data Migration**: If you need to migrate data from the old database to the new one, you'll need to:
   - Export data from old database
   - Import data into new database
   - This is a separate process not covered in this guide

## Troubleshooting

### Frontend Issues:
- **Error: "Missing Supabase environment variables"**
  - Check that `.env.local` exists in `SCraper_frontend/` directory
  - Verify variable names are exactly: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Restart the dev server after updating `.env.local`

### Backend Issues:
- **Error: "SUPABASE_URL environment variable is not set"**
  - Check that `.env` file exists in `Scraper_backend/` directory
  - Verify variable names are exactly: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
  - Restart the backend server after updating `.env`

- **Error: "Permission denied" or authentication errors**
  - Make sure you're using the **service_role key** (not the publishable key)
  - Service role key should start with `sb_service_role_`
  - Verify the key is correct in Supabase Dashboard

## Next Steps

After migration:
1. ✅ Verify all environment variables are set correctly
2. ✅ Test frontend authentication
3. ✅ Test backend API endpoints
4. ✅ Test scraper functionality
5. ✅ Verify data is being written to the new database

