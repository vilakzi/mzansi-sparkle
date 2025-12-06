import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseUsernameAvailabilityReturn {
  isChecking: boolean;
  isAvailable: boolean | null;
  error: string | null;
}

export function useUsernameAvailability(
  username: string,
  currentUserId: string | undefined,
  debounceMs: number = 500
): UseUsernameAvailabilityReturn {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state if username is too short or empty
    if (!username || username.length < 3 || !currentUserId) {
      setIsAvailable(null);
      setError(null);
      setIsChecking(false);
      return;
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      setIsAvailable(false);
      setError('Username can only contain letters, numbers, and underscores');
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    setError(null);

    // Debounce the check
    const timeoutId = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          'check_username_available',
          {
            new_username: username,
            user_id: currentUserId,
          }
        );

        if (rpcError) throw rpcError;

        setIsAvailable(data);
        setError(data ? null : 'Username is already taken');
      } catch (err) {
        console.error('Error checking username:', err);
        setError('Failed to check username availability');
        setIsAvailable(null);
      } finally {
        setIsChecking(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [username, currentUserId, debounceMs]);

  return { isChecking, isAvailable, error };
}
