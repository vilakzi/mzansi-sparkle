# Feed Performance Rollback Guide

## Overview

This document describes the feed performance rollback implementation that addresses the slow personalized feed issue experienced in production (load times >30 seconds).

## Problem Statement

The personalized feed algorithms introduced in Phase 3/4 (`get_personalized_feed`, `get_mixed_feed`, `get_complete_feed_data`) caused extremely slow feed loads in production environments. This rollback provides a safe, non-destructive solution that:

- Restores fast feed behavior using the simpler `get_simple_feed` stored procedure
- Preserves all database objects and data (no drops or deletions)
- Introduces a feature flag for re-enabling personalized algorithms once optimized

## Solution Architecture

### 1. Feature Flag System

A new feature flag system has been implemented in `src/lib/featureFlags.ts`:

- **Function**: `isPersonalizedFeedEnabled()`
- **Environment Variable**: `VITE_PERSONALIZED_FEED_ENABLED`
- **Default**: `false` (uses simple feed)
- **Values**: `"true"`, `"1"`, `"yes"` enable personalized feed; all other values use simple feed

### 2. Feed Implementation

By default, the application uses `get_simple_feed` which:
- Returns posts in reverse chronological order
- Respects privacy settings and blocks
- Includes user profile data in a single query
- Provides fast, predictable performance

When the feature flag is enabled, the application can be switched to use personalized feed algorithms (once they are optimized with caching).

### 3. Runtime Logging

Console logging provides visibility into the current feed mode:

- **Simple mode (default)**: `ℹ️ Running in simple feed mode (fast & optimized)`
- **Personalized mode**: `⚠️ Personalized feed is ENABLED - may experience slow load times (>30s)`

## Production Deployment

### Toggle Feature Flag in Production

To change the feed mode in production:

1. **Use Simple Feed (Default - Fast)**
   ```bash
   VITE_PERSONALIZED_FEED_ENABLED="false"
   # Or simply unset the variable
   ```

2. **Enable Personalized Feed (After Optimization)**
   ```bash
   VITE_PERSONALIZED_FEED_ENABLED="true"
   ```

3. **Restart the application** for environment variable changes to take effect

### Deployment Checklist

- [ ] Verify `VITE_PERSONALIZED_FEED_ENABLED` is set to `"false"` or unset in production environment
- [ ] Deploy the updated code to production
- [ ] Monitor console logs in browser to confirm simple feed mode is active
- [ ] Test feed load performance (should be <2 seconds)
- [ ] Verify all feed functionality works (infinite scroll, refresh, likes, saves)

## Re-enabling Personalized Feed

Once the personalized feed algorithms have been optimized (with caching, materialized views, or other performance improvements):

1. **Test in staging environment first**
   ```bash
   VITE_PERSONALIZED_FEED_ENABLED="true"
   ```

2. **Verify performance improvements**
   - Feed should load in <5 seconds
   - No significant performance degradation under load
   - All personalization features work correctly

3. **Deploy to production**
   - Set `VITE_PERSONALIZED_FEED_ENABLED="true"`
   - Monitor performance metrics
   - Have rollback plan ready (set flag back to `"false"`)

## Database Functions

### get_simple_feed

The simple feed function is defined in migration `20251103145533_b29f73b4-2979-4740-9ee9-166b968d3d43.sql` and provides:

**Signature:**
```sql
get_simple_feed(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
```

**Returns:**
- Post data with all necessary fields
- User profile information (username, display_name, avatar_url, etc.)
- User-specific flags (is_liked, is_saved)
- Respects privacy settings and blocks

**Performance:**
- Simple query with joins
- Uses database indexes effectively
- Consistent performance regardless of user activity

### Personalized Feed Functions (Disabled by Default)

These functions exist in the database but are not called unless the feature flag is enabled:

- `get_personalized_feed` - Recommendation scoring and ranking
- `get_mixed_feed` - Mixed trending + personalized content
- `get_complete_feed_data` - Complete feed with all bells and whistles

## Testing

### Manual Testing

1. **Verify simple feed mode:**
   ```bash
   # Set or verify in .env
   VITE_PERSONALIZED_FEED_ENABLED="false"
   
   # Start dev server
   npm run dev
   
   # Open browser console and check for:
   # ℹ️ Running in simple feed mode (fast & optimized)
   ```

2. **Test personalized feed mode:**
   ```bash
   # Set in .env
   VITE_PERSONALIZED_FEED_ENABLED="true"
   
   # Restart dev server
   npm run dev
   
   # Open browser console and check for:
   # ⚠️ Personalized feed is ENABLED - may experience slow load times (>30s)
   ```

### Performance Testing

Use the browser's Network tab to measure feed load times:

1. Open DevTools → Network tab
2. Filter by XHR/Fetch requests
3. Reload the feed
4. Look for `get_simple_feed` RPC call
5. Verify response time is <2 seconds

## Troubleshooting

### Feed not loading

1. Check console for errors
2. Verify `get_simple_feed` function exists in database
3. Check Supabase connection and authentication

### Wrong feed mode active

1. Verify `.env` file has correct value for `VITE_PERSONALIZED_FEED_ENABLED`
2. Restart dev server after changing `.env`
3. Clear browser cache if needed

### Performance still slow

1. Check database indexes on `posts` table
2. Verify network latency to Supabase
3. Review Supabase query performance in dashboard

## Architecture Notes

### Files Modified

- `src/lib/featureFlags.ts` - Feature flag system (new)
- `src/pages/Index.tsx` - Initial feed load with feature flag
- `src/components/VerticalFeed.tsx` - Feed fetching with feature flag
- `.env` - Feature flag configuration
- `docs/rollback-feed.md` - This documentation (new)

### Migration Strategy

The rollback is non-destructive:
- No database objects are dropped
- No data is lost
- Personalized feed functions remain in database for future use
- Simple revert by toggling feature flag

## Future Optimizations

When re-enabling personalized feed, consider:

1. **Caching Layer**
   - Redis cache for feed results
   - Cache per user with TTL
   - Background refresh strategy

2. **Materialized Views**
   - Pre-compute popular/trending posts
   - Refresh on schedule
   - Reduce real-time computation

3. **Query Optimization**
   - Add missing indexes
   - Optimize JOIN operations
   - Use EXPLAIN ANALYZE to identify bottlenecks

4. **Progressive Enhancement**
   - Load simple feed first
   - Enhance with personalized content asynchronously
   - Graceful degradation if personalization fails

## Support

For issues or questions:
1. Check console logs for error messages
2. Review Supabase logs in dashboard
3. Test in development environment first
4. Contact the development team with specific error messages
