/**
 * Feature Flags
 * 
 * This module provides runtime feature flag configuration for the application.
 * Feature flags are read from environment variables and cached for performance.
 */

/**
 * Check if the personalized feed feature is enabled.
 * 
 * When disabled (default), the app uses the fast get_simple_feed stored procedure.
 * When enabled, the app uses the personalized feed algorithms (get_personalized_feed, 
 * get_mixed_feed, or get_complete_feed_data).
 * 
 * @returns {boolean} true if personalized feed is enabled, false otherwise
 */
export const isPersonalizedFeedEnabled = (): boolean => {
  const envValue = import.meta.env.VITE_PERSONALIZED_FEED_ENABLED;
  
  // Default to false if not set or set to any falsy value
  if (!envValue) {
    return false;
  }
  
  // Parse common truthy string values
  const normalizedValue = String(envValue).toLowerCase().trim();
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
};

/**
 * Get the name of the feed mode for logging/debugging purposes.
 * 
 * @returns {string} 'simple' or 'personalized'
 */
export const getFeedMode = (): string => {
  return isPersonalizedFeedEnabled() ? 'personalized' : 'simple';
};
