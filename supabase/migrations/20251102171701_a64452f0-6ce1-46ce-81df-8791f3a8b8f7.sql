-- Fix infinite recursion in conversation_participants RLS policy
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

-- Create a simpler, non-recursive policy
CREATE POLICY "Users can view participants of their conversations"
ON public.conversation_participants FOR SELECT
USING (
  user_id = auth.uid() OR 
  conversation_id IN (
    SELECT conversation_id 
    FROM public.conversation_participants 
    WHERE user_id = auth.uid()
  )
);