# Feed Performance Test Guide

This document provides instructions for testing and validating the feed performance rollback.

## Prerequisites

- Development environment set up
- Node.js and npm installed
- Supabase credentials configured in `.env`
- Valid user account for testing

## Test 1: Feature Flag Functionality

### Test Simple Feed Mode (Default)

1. **Configure environment**
   ```bash
   # In .env file, ensure:
   VITE_PERSONALIZED_FEED_ENABLED="false"
   # Or comment out/remove the line entirely
   ```

2. **Start dev server**
   ```bash
   npm run dev
   ```

3. **Open browser and login**
   - Navigate to http://localhost:5173 (or your configured port)
   - Login with test credentials
   - Open browser Developer Tools → Console

4. **Expected console output**
   ```
   ℹ️ Running in simple feed mode (fast & optimized)
   ```

5. **Verify feed loads**
   - Feed should load within 1-2 seconds
   - Posts appear in chronological order (newest first)
   - Infinite scroll works
   - Refresh button works

### Test Personalized Feed Mode

1. **Configure environment**
   ```bash
   # In .env file, set:
   VITE_PERSONALIZED_FEED_ENABLED="true"
   ```

2. **Restart dev server**
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

3. **Open browser and login**
   - Navigate to application
   - Open browser Developer Tools → Console

4. **Expected console output**
   ```
   ⚠️ Personalized feed is ENABLED - may experience slow load times (>30s)
   ```

5. **Note**: Currently, both modes use `get_simple_feed` since personalized feed functions 
   are not yet connected in the code. This is by design - the feature flag infrastructure 
   is ready for when personalized feed is optimized and reconnected.

## Test 2: Performance Measurement

### Using Browser DevTools

1. **Open DevTools → Network tab**
2. **Filter by Fetch/XHR**
3. **Reload the page or refresh feed**
4. **Find the RPC call**
   - Look for request to `/rest/v1/rpc/get_simple_feed`
5. **Check timing**
   - Simple feed should complete in <2 seconds
   - Check the "Time" column in Network tab

### Performance Baseline

Expected performance metrics:

| Feed Mode | Expected Load Time | Max Acceptable |
|-----------|-------------------|----------------|
| Simple Feed | <1 second | 2 seconds |
| Personalized Feed (future) | <5 seconds | 10 seconds |

## Test 3: Functional Testing

### Basic Functionality

- [ ] Feed loads on homepage
- [ ] Posts display correctly
- [ ] User can scroll through feed
- [ ] Infinite scroll loads more posts
- [ ] Like button works
- [ ] Save button works
- [ ] Delete post works (for own posts)
- [ ] Profile navigation works
- [ ] Refresh button reloads feed

### Edge Cases

- [ ] Feed works with no posts
- [ ] Feed works with blocked users
- [ ] Feed respects privacy settings
- [ ] Feed handles deleted posts gracefully
- [ ] Refresh after deleting post updates correctly

## Test 4: Build Verification

### Development Build

```bash
npm run dev
```

Expected: No TypeScript errors, app runs successfully

### Production Build

```bash
npm run build
```

Expected output:
```
✓ built in XXs
PWA v1.1.0
mode      generateSW
precache  XX entries
```

### Lint Check

```bash
npm run lint
```

Expected: No linting errors (or only pre-existing warnings)

## Test 5: Database Function Verification

You can test the database function directly using the Supabase SQL Editor or via the JavaScript client:

### Via Browser Console (when logged in)

```javascript
// Test get_simple_feed
const { data, error } = await supabase.rpc('get_simple_feed', {
  p_user_id: 'YOUR_USER_ID_HERE',
  p_limit: 10,
  p_offset: 0
});

console.log('Feed data:', data);
console.log('Error:', error);
console.log('Number of posts:', data?.length);
```

### Via Supabase SQL Editor

```sql
-- Test the function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'get_simple_feed';

-- Test function execution (replace with real user_id)
SELECT * FROM get_simple_feed(
  'YOUR_USER_ID_HERE'::uuid,
  10,
  0
);
```

## Test 6: Migration Verification

### Check Migration Applied

```sql
-- In Supabase SQL Editor, check applied migrations
SELECT * FROM supabase_migrations.schema_migrations 
WHERE version LIKE '20251103160000%';
```

### Verify Function Definition

```sql
-- Check function exists with correct signature
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_name = 'get_simple_feed'
  AND routine_schema = 'public';
```

## Expected Test Results Summary

✅ **PASS Criteria:**
- Console logging shows correct feed mode
- Feed loads in <2 seconds
- All functional tests pass
- Build completes without errors
- No lint errors introduced
- Migration creates function successfully

❌ **FAIL Criteria:**
- Feed doesn't load
- Console shows errors
- Build fails
- Function not found in database
- Feature flag doesn't affect logging

## Performance Benchmarks

Record your test results:

| Test Run | Feed Mode | Load Time | Posts Loaded | Notes |
|----------|-----------|-----------|--------------|-------|
| 1 | Simple | ___ ms | ___ | |
| 2 | Simple | ___ ms | ___ | |
| 3 | Simple | ___ ms | ___ | |

## Troubleshooting

### Feed not loading
- Check browser console for errors
- Verify Supabase connection in `.env`
- Check if user is authenticated

### Feature flag not working
- Restart dev server after changing `.env`
- Clear browser cache
- Check `.env` syntax (no spaces around `=`)

### Console logging not appearing
- Open DevTools before loading page
- Check console filter settings
- Verify imports in component files

## Automated Testing (Future Enhancement)

This section is for future automated test implementation:

```typescript
// Example test structure
describe('Feed Performance', () => {
  it('should load simple feed in under 2 seconds', async () => {
    // Test implementation
  });
  
  it('should use simple feed when flag is false', async () => {
    // Test implementation
  });
  
  it('should log correct feed mode', async () => {
    // Test implementation
  });
});
```

## Reporting Issues

When reporting issues, include:
1. Feed mode (simple/personalized)
2. Environment variable values
3. Console logs and errors
4. Network tab timing
5. Browser and version
6. Steps to reproduce
