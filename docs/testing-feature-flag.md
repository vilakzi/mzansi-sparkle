# Testing Feature Flag Locally

This guide shows how to test the feed performance feature flag in your local development environment.

## Prerequisites

- Node.js and npm installed
- Local clone of the repository
- Valid Supabase credentials in `.env` file

## Step 1: Set Up Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials.

## Step 2: Test Simple Feed Mode (Default)

1. Set the feature flag to false in `.env`:
   ```bash
   VITE_PERSONALIZED_FEED="false"
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the browser and navigate to the app

4. Open the browser console (F12 or Cmd+Option+I)

5. Look for the feed mode log message:
   ```
   ✓ Using simple feed mode for fast performance.
   ```

6. Verify the feed loads quickly (< 2 seconds)

## Step 3: Test Personalized Feed Mode (When Available)

1. Set the feature flag to true in `.env`:
   ```bash
   VITE_PERSONALIZED_FEED="true"
   ```

2. **Important**: Rebuild the app (Vite env vars are build-time):
   ```bash
   npm run build
   npm run preview
   ```
   Or restart the dev server:
   ```bash
   # Press Ctrl+C to stop
   npm run dev
   ```

3. Open the browser console

4. Look for the warning message:
   ```
   ⚠️ Personalized feed is enabled. This may result in slower feed loads (>30s)...
   ```

5. Note: Currently personalized feed functions don't exist, so the app will still call `get_simple_feed`

## Step 4: Run Validation Script

Test both feed modes with the validation script:

```bash
npm run validate-feed
```

Expected output:
```
🚀 Feed Validation Script
========================

🚩 Checking feature flag configuration...
✓ VITE_PERSONALIZED_FEED is disabled (simple feed mode)

📊 Testing get_simple_feed...
✅ get_simple_feed succeeded in 245ms
   Returned 20 posts
   ✓ All expected fields present

📊 Testing get_personalized_feed...
⚠️  get_personalized_feed does not exist (expected - not yet implemented)
   This function should be created when personalized feed is optimized

==================================================
📋 SUMMARY
==================================================

Simple Feed:
  ✅ Working (245ms, 20 posts)
  🚀 Excellent performance!

Personalized Feed:
  ⚠️  Not implemented (expected)
  ℹ️  Will be created when optimization is complete

Feature Flag:
  ✅ Disabled - App will use simple feed (recommended)

==================================================

✅ Validation passed - Simple feed is working correctly
```

## Troubleshooting

### Feature flag not taking effect

**Issue**: Changed `.env` but app still uses old setting

**Solution**: Vite environment variables are set at build time. You must:
1. Restart the dev server (`npm run dev`)
2. Or rebuild the app (`npm run build && npm run preview`)

### Console log not appearing

**Issue**: No feed mode log in console

**Possible causes**:
1. Feed hasn't loaded yet - wait for the feed to appear
2. Browser console filter is hiding info/warn messages
3. Check Console filter settings

### Validation script fails

**Issue**: `npm run validate-feed` shows errors

**Common causes**:
1. Missing `.env` file - copy from `.env.example`
2. Invalid Supabase credentials
3. Network connectivity issues
4. Database doesn't have any posts yet (warning, not error)

## What to Look For

### Performance Indicators

**Good Performance** (Simple Feed):
- Feed loads in < 2 seconds
- Console shows: `✓ Using simple feed mode`
- Smooth scrolling and pagination

**Slow Performance** (Personalized Feed - when implemented):
- Feed loads in > 10 seconds
- Console shows: `⚠️ Personalized feed is enabled`
- May experience delays during pagination

### Browser Network Tab

1. Open DevTools Network tab
2. Filter by "Fetch/XHR"
3. Look for requests to Supabase
4. Check the `rpc/get_simple_feed` request timing
5. Good: < 500ms, Acceptable: < 2000ms, Slow: > 5000ms

## Testing Different Scenarios

### Test 1: Initial Page Load

1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Measure time to first post visible
4. Check console for feed mode log

### Test 2: Pagination

1. Scroll down to trigger more posts
2. Check network tab for additional RPC calls
3. Verify pagination is smooth

### Test 3: Refresh Feed

1. Use the refresh button in the app
2. Verify feed refreshes correctly
3. Check console for repeated log messages

## Next Steps

Once personalized feed is optimized and implemented:

1. Set `VITE_PERSONALIZED_FEED="true"`
2. Rebuild the app
3. Compare performance with simple feed
4. Monitor for slow loads (>10s)
5. Switch back to simple feed if performance degrades

## Additional Resources

- [Main Documentation](rollback-feed.md) - Full feature flag system documentation
- [README](../README.md) - Project setup and deployment
- Supabase Dashboard - Monitor function performance and logs
