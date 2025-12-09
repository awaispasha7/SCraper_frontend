# Apartments Sync Setup Guide

## Overview

The apartments sync feature requires communication between the frontend and backend services. This guide explains how to configure it properly.

## Problem

When clicking "Sync Data" on the apartments page, you may see:
```
⚠️ NEXT_PUBLIC_BACKEND_URL not configured. Cannot use backend API.
❌ Apartments sync failed: Scraper directory not found
```

This happens because:
1. The frontend is trying to use a local scraper (which doesn't exist in deployment)
2. The `NEXT_PUBLIC_BACKEND_URL` environment variable is not configured

## Solution

### Step 1: Configure Frontend Environment Variable

You need to set the `NEXT_PUBLIC_BACKEND_URL` environment variable in your frontend deployment.

#### For Vercel:
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `NEXT_PUBLIC_BACKEND_URL`
   - **Value**: Your backend URL (e.g., `https://your-backend.railway.app`)
   - **Environment**: Production, Preview, Development (select all)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

#### For Other Platforms:
Add the environment variable in your platform's configuration:
- **Railway**: Project → Variables tab
- **Netlify**: Site settings → Environment variables
- **Local Development**: Create a `.env.local` file (see `.env.example`)

### Step 2: Verify Backend is Running

Ensure your backend API server is running and accessible at the URL you configured.

Test the backend endpoint:
```bash
curl -X POST https://your-backend-url.railway.app/api/trigger-apartments
```

You should receive a response like:
```json
{
  "message": "Apartments scraper started",
  "started_at": "2025-12-09T...",
  "city": "chicago-il",
  "note": "Scraper will automatically upload results to Supabase"
}
```

### Step 3: Verify Backend Scraper Path

The backend expects the scraper at:
```
{backend_root}/apartments home/apartments/apartments/
```

Ensure this directory structure exists in your backend deployment.

## How It Works

1. **Frontend** (`/api/apartments-sync`):
   - Checks for `NEXT_PUBLIC_BACKEND_URL`
   - If found, calls `${BACKEND_URL}/api/trigger-apartments`
   - If not found, tries local scraper (fails in deployment)

2. **Backend** (`/api/trigger-apartments`):
   - Receives the trigger request
   - Runs the apartments scraper in a background thread
   - Scraper automatically uploads results to Supabase
   - Returns status immediately (scraper runs async)

3. **Supabase**:
   - Stores all scraped listings
   - Frontend fetches from Supabase to display listings

## Troubleshooting

### Error: "NEXT_PUBLIC_BACKEND_URL not configured"
- **Solution**: Add the environment variable in your deployment platform
- **Note**: Variable name must start with `NEXT_PUBLIC_` for Next.js to expose it to the browser

### Error: "Backend API request failed"
- **Solution**: 
  1. Verify backend URL is correct (no trailing slash)
  2. Check backend is running and accessible
  3. Verify backend has CORS enabled if needed
  4. Check backend logs for errors

### Error: "Scraper directory not found" (in backend)
- **Solution**: Ensure the scraper directory structure exists:
  ```
  backend_root/
    apartments home/
      apartments/
        apartments/
          scrapy.cfg
          apartments_scraper/
          ...
  ```

### Error: "Backend API request timed out"
- **Solution**: 
  1. Check backend is running
  2. Verify network connectivity
  3. Check backend logs for long-running operations

## Environment Variables Summary

### Frontend Required:
- `NEXT_PUBLIC_BACKEND_URL` - Backend API URL (required for apartments sync)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

### Backend Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service role key (for write access)
- `PORT` - Server port (usually set automatically by platform)

## Testing

After configuration, test the sync:

1. Go to the apartments page in your frontend
2. Click "Sync Data"
3. Check the console for:
   - `🌐 Using backend API: https://your-backend-url...`
   - `✅ Backend apartments scraper triggered`
4. Check backend logs for scraper execution
5. Verify listings appear in Supabase

## Support

If issues persist:
1. Check frontend console logs
2. Check backend logs
3. Verify all environment variables are set correctly
4. Test backend endpoint directly with curl/Postman

