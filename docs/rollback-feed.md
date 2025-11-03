# Feed Performance Rollback Documentation

## Overview

This document describes the feed performance rollback implemented to address slow feed load times in production (>30s). The solution provides a safe, non-destructive rollback to a simpler, faster feed algorithm while maintaining the ability to re-enable personalized feeds in the future.

## Problem

The personalized feed algorithms (`get_personalized_feed`, `get_mixed_feed`, `get_complete_feed_data`) introduced in Phase 3/4 were causing extremely slow feed loads in production, significantly degrading user experience.

## Solution

We've implemented a feature flag system that allows switching between:
- **Simple Feed** (default): Fast, time-bucketed random feed with basic filtering
- **Personalized Feed** (opt-in): Advanced algorithms with better content matching but potentially slower performance

## Architecture

### 1. Feature Flag System

The feature flag is controlled via the `VITE_PERSONALIZED_FEED` environment variable:

```bash
# .env file
VITE_PERSONALIZED_FEED="false"  # Default: use simple feed
# VITE_PERSONALIZED_FEED="true"  # Enable personalized feed (when optimized)
```

### 2. Code Implementation

**Feature Flag Utility** (`src/lib/featureFlags.ts`):
```typescript
export function isPersonalizedFeedEnabled(): boolean
```

**Feed Components**:
- `src/pages/Index.tsx` - Initial feed load
- `src/components/VerticalFeed.tsx` - Feed pagination and refresh

Both components:
1. Check the feature flag via `isPersonalizedFeedEnabled()`
2. Log the current mode to the console
3. Call the appropriate RPC function (currently always `get_simple_feed`)

### 3. Database Functions

**Current Implementation**:
- `get_simple_feed(p_user_id, p_feed_type, p_limit, p_offset)` - Fast, simple feed

**Future Personalized Feed** (to be implemented when optimized):
- Functions will need to be recreated with proper caching and optimization
- Code is ready to switch based on feature flag

### 4. Database Migration

Migration `20251103161151_4f662d1d-6dff-4c3c-b5e0-7c85764f3e98.sql`:
- Creates `get_simple_feed` if it doesn't exist (idempotent)
- Creates necessary indexes for performance
- **Does NOT drop** any existing functions or tables (non-destructive)

## How to Toggle the Feature Flag

### In Development

1. Edit `.env` file:
   ```bash
   VITE_PERSONALIZED_FEED="false"  # Simple feed (default)
   # or
   VITE_PERSONALIZED_FEED="true"   # Personalized feed
   ```

2. Restart the development server:
   ```bash
   npm run dev
   ```

3. Check the browser console for feed mode confirmation:
   - Simple mode: `✓ Using simple feed mode for fast performance.`
   - Personalized mode: `⚠️ Personalized feed is enabled...`

### In Production (Vite-based deployment)

Set the environment variable in your hosting platform:

**Netlify/Vercel**:
```
VITE_PERSONALIZED_FEED=false
```

**Docker**:
```dockerfile
ENV VITE_PERSONALIZED_FEED=false
```

**Note**: Vite environment variables must be set at **build time**, not runtime. You'll need to rebuild and redeploy to change the flag.

## Monitoring Feed Performance

### Console Logging

The app logs the current feed mode on every feed load:

- **Simple Feed**: `✓ Using simple feed mode for fast performance.`
- **Personalized Feed**: `⚠️ Personalized feed is enabled. This may result in slower feed loads (>30s)...`

### Performance Expectations

| Feed Type | Expected Load Time | Characteristics |
|-----------|-------------------|-----------------|
| Simple Feed | < 2s | Time-bucketed shuffle, basic privacy filtering |
| Personalized Feed | Variable (can be >30s) | Advanced algorithms, user interest matching |

## Re-enabling Personalized Feed

Before re-enabling personalized feed in production:

1. **Optimize the Algorithms**:
   - Add proper database indexes
   - Implement result caching (Redis/Memcached)
   - Add materialized views for expensive queries
   - Optimize query plans

2. **Test Performance**:
   ```bash
   # Set flag to true in .env
   VITE_PERSONALIZED_FEED="true"
   
   # Run the validation script
   npm run validate-feed
   ```

3. **Recreate Personalized Functions**:
   - Create a new migration with optimized `get_personalized_feed` function
   - Ensure it includes proper caching mechanisms

4. **Update Code Logic**:
   - In `Index.tsx` and `VerticalFeed.tsx`, update the TODO sections to conditionally call the personalized feed RPC

5. **Deploy with Flag Disabled**:
   - Deploy code changes first with flag still set to `false`
   - Monitor for any issues

6. **Gradually Enable**:
   - Enable for a small percentage of users first
   - Monitor performance and error rates
   - Gradually increase if performance is acceptable

## Rollback Plan

If personalized feed causes issues after re-enabling:

1. **Immediate**: Set `VITE_PERSONALIZED_FEED=false` and rebuild/redeploy
2. **Short-term**: The code will automatically fall back to `get_simple_feed`
3. **No data loss**: All data structures remain intact

## Validation

Run the validation script to test both feed modes:

```bash
npm run validate-feed
```

This will:
- Test feed RPC calls with sample user IDs
- Measure response times
- Verify data structure compatibility

## Security Considerations

- All feed functions use `SECURITY DEFINER` with proper RLS policies
- Privacy settings are respected in both simple and personalized feeds
- Blocking relationships are honored
- No sensitive user data is exposed

## Maintenance

### Future Improvements

1. **Caching Layer**: Implement Redis/Memcached for feed results
2. **Materialized Views**: Pre-compute expensive aggregations
3. **CDN Integration**: Cache feed responses at edge
4. **A/B Testing**: Framework for gradual feature rollout
5. **Performance Metrics**: Add detailed timing and monitoring

### Related Files

- Feature flag: `src/lib/featureFlags.ts`
- Feed pages: `src/pages/Index.tsx`
- Feed component: `src/components/VerticalFeed.tsx`
- Migration: `supabase/migrations/20251103161151_*.sql`
- Environment: `.env`

## Support

For issues or questions:
1. Check browser console for feed mode logs
2. Verify environment variable is set correctly
3. Ensure migration has been applied to database
4. Review Supabase function logs for errors

## Change Log

- **2025-11-03**: Initial implementation of feature flag system and simple feed rollback
```markdown
# Rollback: default feed -> get_simple_feed (fast) with feature flag

Problem
--------
Personalized feed stored procedures (get_personalized_feed, get_mixed_feed, get_complete_feed_data) were introduced and are causing extremely slow feed loads in production (requests > 30s).

Goal
-----
Restore fast feed behavior quickly without dropping data or destructive DB changes.

What this rollback does
-----------------------
- Default the app to use the fast `get_simple_feed` RPC.
- Add a read-only environment feature flag NEXT_PUBLIC_PERSONALIZED_FEED to re-enable personalization later.
- Add a non-destructive DB migration to ensure `get_simple_feed` exists (CREATE OR REPLACE).
- Provide a shared feed service to centralize the RPC call and normalize result shape.

How to enable personalized feed (when ready)
--------------------------------------------
- Set environment variable NEXT_PUBLIC_PERSONALIZED_FEED=true (and redeploy).
- Ensure DB/indices and any precomputations for personalization are in place.

Verification steps
------------------
1. Deploy the changes.
2. Call the simple feed RPC manually from psql and measure timing:
   ```
   	iming
   SELECT COUNT(*) FROM get_simple_feed('<SOME_USER_UUID>'::uuid, 'for-you', 20, 0);
   ```
3. From the app, view console — you should see an info line:
   - Simple mode: `[feed] Running in SIMPLE feed mode (get_simple_feed)`
   - Personalized mode: `[feed] Running in PERSONALIZED feed mode (get_personalized_feed). This may be slower.`

Notes & precautions
-------------------
- This PR does not delete or modify personalized feed functions or any user data.
- If destructive migrations were applied to the DB earlier (e.g., dropped tables), restore from backups first. This PR will not recreate lost data.
```
