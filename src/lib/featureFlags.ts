// Small read-only feature flag helper for feed behavior.
// Reads NEXT_PUBLIC_PERSONALIZED_FEED as a string 'true'|'false' (default false).
export function isPersonalizedFeedEnabled(): boolean {
  try {
    const v = (process.env.NEXT_PUBLIC_PERSONALIZED_FEED || "false").toLowerCase();
    return v === "true" || v === "1";
  } catch (e) {
    // In browser environments process.env might be polyfilled; fallback to false
    return false;
  }
}

export default {};