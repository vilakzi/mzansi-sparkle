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