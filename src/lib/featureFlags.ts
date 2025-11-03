/**
 * Feature Flags Configuration
 * 
 * This module provides runtime feature flag utilities for the application.
 * Feature flags are read from environment variables prefixed with NEXT_PUBLIC_
 * to ensure they're available in the browser.
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
