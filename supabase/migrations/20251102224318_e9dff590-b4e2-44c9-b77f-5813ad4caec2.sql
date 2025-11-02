-- Simplify DM system - Remove unused features

-- Remove unused columns from messages table
ALTER TABLE public.messages 
DROP COLUMN IF EXISTS reply_to_message_id,
DROP COLUMN IF EXISTS media_url,
DROP COLUMN IF EXISTS media_type;

-- Remove unused column from conversation_participants
ALTER TABLE public.conversation_participants
DROP COLUMN IF EXISTS is_muted;

-- Simplify the update_conversation_last_message trigger function
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Update conversation metadata
  UPDATE public.conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = now()
  WHERE id = NEW.conversation_id;
  
  -- Increment unread count for other participants
  UPDATE public.conversation_participants
  SET unread_count = unread_count + 1
  WHERE conversation_id = NEW.conversation_id
  AND user_id != NEW.sender_id;
  
  RETURN NEW;
END;
$function$;