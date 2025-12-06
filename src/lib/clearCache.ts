/**
 * Emergency utility to clear all caches and service workers
 * Use this when stuck in a broken cache state
 * 
 * Usage: Import and call in browser console or add to a debug button
 */
export async function clearAllCaches(): Promise<void> {
  try {
    // Clear all cache storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log('Clearing caches:', cacheNames);
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
      console.log('✓ All caches cleared');
    }
    
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('Unregistering service workers:', registrations.length);
      await Promise.all(
        registrations.map(registration => registration.unregister())
      );
      console.log('✓ All service workers unregistered');
    }
    
    console.log('✓ Cache cleanup complete - reloading page...');
    
    // Reload the page to apply changes
    window.location.reload();
  } catch (error) {
    console.error('Error clearing caches:', error);
    throw error;
  }
}

/**
 * Check current cache status (for debugging)
 */
export async function getCacheStatus(): Promise<{
  cacheNames: string[];
  serviceWorkers: number;
  isProduction: boolean;
}> {
  const cacheNames = 'caches' in window ? await caches.keys() : [];
  const registrations = 'serviceWorker' in navigator 
    ? await navigator.serviceWorker.getRegistrations() 
    : [];
  
  return {
    cacheNames,
    serviceWorkers: registrations.length,
    isProduction: import.meta.env.PROD
  };
}
