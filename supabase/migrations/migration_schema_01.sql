-- ════════════════════════════════════════════════════════════════════
-- BUG 3 FIX: Increment user_stats counters on each user message
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_user_message_stats()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.role <> 'user' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.conversations
   WHERE id = NEW.conversation_id
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_stats (
    user_id, tier, total_messages, monthly_messages,
    first_message_at, last_message_at
  )
  VALUES (v_user_id, 'free', 1, 1, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_messages   = public.user_stats.total_messages   + 1,
    monthly_messages = public.user_stats.monthly_messages + 1,
    last_message_at  = NOW(),
    first_message_at = COALESCE(public.user_stats.first_message_at, NOW());

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'increment_user_message_stats failed for conversation %: %',
    NEW.conversation_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_increments_stats ON public.messages;

CREATE TRIGGER trg_message_increments_stats
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_user_message_stats();