# Deploy Apartments Fix to Railway

## 📝 **What Changed:**

I fixed 3 files:

1. ✅ `app/api/apartments-listings/route.ts`
   - Added better error handling
   - Added timeout protection
   - Added logging for debugging

2. ✅ `app/api/test-apartments/route.ts` (NEW)
   - Diagnostic endpoint to test Supabase connection
   - Shows exactly what's wrong

3. ✅ Backend pipeline files (already done)
   - Generates address_hash automatically
   - No further changes needed

---

## 🚀 **Deploy to Railway:**

### **Step 1: Commit Changes**

```bash
cd C:\Users\HomePC\Desktop\scraper\SCraper_frontend

git add .
git commit -m "Fix apartments API - Add error handling and diagnostics"
git push
```

### **Step 2: Configure Railway Environment Variables**

⚠️ **CRITICAL:** Without this, the API won't work!

1. Go to: https://railway.app/dashboard
2. Select: **scraperfrontend-production**
3. Click: **Variables** tab
4. Add these (get values from Supabase Dashboard → Settings → API):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

5. Click **Deploy**

### **Step 3: Test After Deployment**

Wait 2-3 minutes for deployment, then test:

**Diagnostic endpoint:**
```
https://scraperfrontend-production.up.railway.app/api/test-apartments
```

**Apartments page:**
```
https://scraperfrontend-production.up.railway.app/apartments
```

---

## ✅ **Expected Results:**

### **Before Fix:**
- ❌ "No Listings Available"
- ❌ API times out
- ❌ Console shows errors

### **After Fix:**
- ✅ Shows "729 Available Listings"
- ✅ API responds in < 2 seconds
- ✅ All apartment cards display
- ✅ Enrichment works

---

## 🔍 **Troubleshooting:**

### **If still showing "No Listings Available":**

1. **Check Railway logs:**
   - Railway Dashboard → Deployments → Latest → Logs
   - Look for errors

2. **Check diagnostic endpoint:**
   - Should show all checks passing
   - If any fail, that's your issue

3. **Check environment variables:**
   - Railway → Variables
   - Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set

4. **Clear browser cache:**
   - Ctrl+Shift+Delete
   - Hard refresh: Ctrl+F5

---

## 📞 **Quick Commands:**

```bash
# Commit and push
cd C:\Users\HomePC\Desktop\scraper\SCraper_frontend
git add .
git commit -m "Fix apartments API"
git push

# Test locally first (optional)
npm run dev
# Then visit: http://localhost:3000/apartments
```

---

That's it! Once you set the environment variables on Railway and deploy, it will work! 🎉
