-- Function to create follow notification
CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Don't notify if unfollowing
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create notification when someone follows
CREATE TRIGGER create_notification_on_follow
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.create_follow_notification();

-- Function to create like notification
CREATE OR REPLACE FUNCTION public.create_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get post owner
    SELECT user_id INTO v_post_owner_id
    FROM posts
    WHERE id = NEW.post_id;
    
    -- Don't notify yourself
    IF v_post_owner_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, actor_id, type, post_id)
      VALUES (v_post_owner_id, NEW.user_id, 'like', NEW.post_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create notification when someone likes
CREATE TRIGGER create_notification_on_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_like_notification();