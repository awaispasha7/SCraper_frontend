# Frontend Deployment Guide

## Quick Deploy to Vercel

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login
```bash
vercel login
```

### Step 3: Deploy
```bash
# From frontend directory
cd fsdf/frontend
vercel

# For production
vercel --prod
```

### Step 4: Add Environment Variables
In Vercel Dashboard → Your Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ATTOM_API_KEY=your_attom_api_key
MELISSA_API_KEY=your_melissa_api_key
```

### Step 5: Push to Git (Optional but Recommended)
```bash
# Initialize git if not already
git init

# Add all files
git add .

# Commit
git commit -m "Deploy frontend"

# Add remote (create repo on GitHub first)
git remote add origin https://github.com/yourusername/forsalebyowner-frontend.git

# Push
git push -u origin main
```

---

## Alternative: Deploy via GitHub

1. Push code to GitHub
2. Go to vercel.com
3. Import GitHub repository
4. Set root directory to `frontend`
5. Add environment variables
6. Deploy

---

## Build Test
Before deploying, test build locally:
```bash
npm run build
npm start
```

