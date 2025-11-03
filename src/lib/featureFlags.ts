/**
 * Feature Flags Configuration
 * 
 * This module provides runtime feature flag utilities for the application.
 * Feature flags are read from environment variables prefixed with VITE_
 * to ensure they're available in the browser (Vite convention).
 */

/**
 * Checks if the personalized feed algorithm is enabled.
 * 
 * When enabled, the app will use advanced feed algorithms (get_personalized_feed, get_mixed_feed)
 * that provide better content matching but may be slower.
 * 
 * When disabled (default), the app uses the simple, fast feed algorithm (get_simple_feed).
 * 
 * @returns {boolean} true if personalized feed is enabled, false otherwise
 */
export function isPersonalizedFeedEnabled(): boolean {
  const envValue = import.meta.env.VITE_PERSONALIZED_FEED;
  
  // Default to false for safety - simple feed is faster
  if (!envValue) {
    return false;
  }
  
  // Parse the environment variable (handles "true", "1", "yes")
  const normalized = envValue.toString().toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
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
