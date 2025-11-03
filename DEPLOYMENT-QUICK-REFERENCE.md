# Feed Rollback - Quick Deployment Reference

## 🚀 Quick Start

This PR adds a feature flag to control feed behavior. **By default, the fast simple feed is used.**

## Environment Variable

```bash
# Simple Feed (Default - Fast, Recommended)
VITE_PERSONALIZED_FEED_ENABLED="false"
# or leave unset

# Personalized Feed (Slower - Use only after optimization)
VITE_PERSONALIZED_FEED_ENABLED="true"
```

## Pre-Deployment Checklist

- [ ] Verify `VITE_PERSONALIZED_FEED_ENABLED` is set to `"false"` or unset in production
- [ ] Run database migration: `20251103160000_create_simple_feed_if_missing.sql`
- [ ] Deploy code to production
- [ ] Restart application

## Post-Deployment Verification

1. **Open browser console** on the feed page
2. **Look for log message:**
   - ✅ Expected: `ℹ️ Running in simple feed mode (fast & optimized)`
   - ⚠️ If you see: `⚠️ Personalized feed is ENABLED - may experience slow load times (>30s)` → Check environment variable

3. **Test feed performance:**
   - Feed should load in < 2 seconds
   - Infinite scroll should work
   - Like/save functionality should work

## Troubleshooting

### Feed is slow
→ Check console for warning message  
→ Verify `VITE_PERSONALIZED_FEED_ENABLED="false"` in production  
→ Restart application

### Feed not loading
→ Check browser console for errors  
→ Verify database migration was applied  
→ Check Supabase connection

### Console shows personalized mode but env is false
→ Clear browser cache  
→ Restart application  
→ Verify environment variable in runtime

## Rollback Plan

If issues occur:
1. Set `VITE_PERSONALIZED_FEED_ENABLED="false"` (if not already)
2. Restart application
3. Verify console shows simple feed mode

**No database rollback needed** - migration is non-destructive and safe.

## Feature Flag Toggle (Future)

When personalized feed is optimized and ready:

1. **Test in staging first**
   ```bash
   VITE_PERSONALIZED_FEED_ENABLED="true"
   ```

2. **Verify performance is acceptable** (< 5 seconds)

3. **Deploy to production**
   - Set flag to `"true"`
   - Monitor performance
   - Have rollback ready (set to `"false"`)

## Files Changed

- `src/lib/featureFlags.ts` - Feature flag logic
- `src/pages/Index.tsx` - Added logging
- `src/components/VerticalFeed.tsx` - Added logging
- `supabase/migrations/20251103160000_create_simple_feed_if_missing.sql` - DB migration

## Support

- Full documentation: `docs/rollback-feed.md`
- Testing guide: `test-feed-performance.md`

## Key Points

✅ **Safe**: No data loss, no function drops  
✅ **Simple**: Single environment variable toggle  
✅ **Fast**: Default behavior is optimized simple feed  
✅ **Reversible**: Easy to enable/disable at any time  
✅ **Visible**: Console logs show current mode  

## Performance Expectations

| Mode | Load Time | Status |
|------|-----------|--------|
| Simple Feed (default) | < 2s | ✅ Production Ready |
| Personalized Feed | > 30s | ⚠️ Needs Optimization |
