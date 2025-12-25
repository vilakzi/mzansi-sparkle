/**
 * Haptic Feedback Utilities
 * Provides vibration feedback for mobile interactions
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 30],
  warning: [30, 50, 30],
  error: [50, 30, 50, 30, 50],
  selection: 5,
};

/**
 * Check if haptic feedback is supported
 */
export const isHapticSupported = (): boolean => {
  return 'vibrate' in navigator;
};

/**
 * Trigger haptic feedback
 */
export const haptic = (pattern: HapticPattern = 'light'): void => {
  if (!isHapticSupported()) return;
  
  try {
    navigator.vibrate(patterns[pattern]);
  } catch (error) {
    // Silently fail if vibration is not allowed
    console.debug('[Haptics] Vibration not allowed:', error);
  }
};

/**
 * Haptic feedback for like action
 */
export const hapticLike = (): void => {
  haptic('success');
};

/**
 * Haptic feedback for save/bookmark action
 */
export const hapticSave = (): void => {
  haptic('medium');
};

/**
 * Haptic feedback for pull-to-refresh threshold
 */
export const hapticRefresh = (): void => {
  haptic('heavy');
};

/**
 * Haptic feedback for scroll snap
 */
export const hapticSnap = (): void => {
  haptic('light');
};

/**
 * Haptic feedback for selection
 */
export const hapticSelect = (): void => {
  haptic('selection');
};

/**
 * Haptic feedback for errors
 */
export const hapticError = (): void => {
  haptic('error');
};
