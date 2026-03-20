-- ════════════════════════════════════════════════════════════════════════════
-- SEDREX — MASTER DATABASE SCHEMA DEFINITION 
-- ════════════════════════════════════════════════════════════════════════════
-- WARNING: This script assumes a fresh `public` schema. If you are starting over,
-- run this first to wipe everything:
-- 
--    DROP SCHEMA public CASCADE;
--    CREATE SCHEMA public;
--    GRANT ALL ON SCHEMA public TO postgres;
--    GRANT ALL ON SCHEMA public TO public;
--
-- Then run this entire script.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. TABLES (Core App Data)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.profiles (
  id                    UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email                 TEXT UNIQUE,
  full_name             TEXT,
  display_name          TEXT,
  avatar_url            TEXT,
  tier                  TEXT DEFAULT 'free',
  is_admin              BOOLEAN DEFAULT false,
  is_banned             BOOLEAN DEFAULT false,
  ban_reason            TEXT,
  timezone              TEXT DEFAULT 'UTC',
  country               TEXT,
  city                  TEXT,
  device_type           TEXT,
  browser               TEXT,
  os                    TEXT,
  signup_source         TEXT DEFAULT 'email',
  referrer              TEXT,
  notes                 TEXT,
  last_seen_at          TIMESTAMPTZ,
  total_sessions        INTEGER DEFAULT 0,
  total_tokens_lifetime BIGINT DEFAULT 0,
  preferred_model       TEXT DEFAULT 'auto',
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.user_preferences (
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  theme                    TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark', 'auto')),
  language                 TEXT DEFAULT 'en',
  default_model            TEXT DEFAULT 'auto',
  enable_web_search        BOOLEAN DEFAULT true,
  enable_code_execution    BOOLEAN DEFAULT false,
  enable_artifacts         BOOLEAN DEFAULT true,
  font_size                TEXT DEFAULT 'medium',
  response_format          TEXT DEFAULT 'balanced',
  custom_instructions      TEXT,
  auto_save                BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{"email_summaries": true, "usage_alerts": true, "new_features": true}'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at               TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.user_stats (
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  tier                     TEXT DEFAULT 'free',
  total_messages           INTEGER DEFAULT 0,
  monthly_messages         INTEGER DEFAULT 0,
  tokens_estimated         INTEGER DEFAULT 0,
  total_input_tokens       BIGINT DEFAULT 0,
  total_output_tokens      BIGINT DEFAULT 0,
  model_usage              JSONB DEFAULT '{}'::jsonb,
  daily_history            JSONB DEFAULT '[]'::jsonb,
  subscription_status      TEXT DEFAULT 'none',
  subscription_start       TIMESTAMPTZ,
  period_end               TIMESTAMPTZ,
  last_reset_date          TIMESTAMPTZ,
  tokens_remaining         INTEGER,
  storage_used_mb          NUMERIC(10,2) DEFAULT 0,
  storage_limit_mb         NUMERIC(10,2) DEFAULT 100,
  total_conversations      INTEGER DEFAULT 0,
  total_artifacts          INTEGER DEFAULT 0,
  total_code_requests      INTEGER DEFAULT 0,
  total_live_requests      INTEGER DEFAULT 0,
  total_reasoning_requests INTEGER DEFAULT 0,
  streak_days              INTEGER DEFAULT 0,
  longest_streak           INTEGER DEFAULT 0,
  avg_session_minutes      NUMERIC(8,2) DEFAULT 0,
  favorite_model           TEXT,
  first_message_at         TIMESTAMPTZ,
  last_message_at          TIMESTAMPTZ,
  last_active_at           TIMESTAMPTZ
);

CREATE TABLE public.conversations (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title                   TEXT DEFAULT 'New Chat',
  is_favorite             BOOLEAN DEFAULT false,
  is_archived             BOOLEAN DEFAULT false,
  folder_id               UUID,
  tags                    TEXT[],
  preferred_model         TEXT DEFAULT 'auto',
  intent                  TEXT,
  agent_type              TEXT,
  model_used              TEXT,
  message_count           INTEGER DEFAULT 0,
  total_tokens            INTEGER DEFAULT 0,
  total_input_tokens      BIGINT DEFAULT 0,
  total_output_tokens     BIGINT DEFAULT 0,
  is_initial_session_chat BOOLEAN DEFAULT false,
  created_at              TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_modified           TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.messages (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id     UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  parent_message_id   UUID REFERENCES public.messages(id),
  role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content             TEXT NOT NULL,
  model               TEXT,
  model_name          TEXT,
  is_auto_selected    BOOLEAN DEFAULT false,
  intent              TEXT,
  agent_type          TEXT,
  agent_provider      TEXT,
  tokens_used         INTEGER DEFAULT 0,
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  response_time_ms    INTEGER DEFAULT 0,
  processing_time_ms  INTEGER,
  image_data          JSONB,
  documents           JSONB DEFAULT '[]'::jsonb,
  grounding_chunks    JSONB,
  metadata            JSONB DEFAULT '{}'::jsonb,
  codebase_ref        JSONB,
  has_artifacts       BOOLEAN DEFAULT false,
  artifact_id         UUID,
  feedback            TEXT,
  feedback_rating     INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_comment    TEXT,
  error_message       TEXT,
  timestamp           TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.artifacts (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  -- We map session_id to conversations for legacy/flexibility, though the app uses it for chats
  session_id      UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  language        TEXT NOT NULL DEFAULT 'text',
  content         TEXT NOT NULL DEFAULT '',
  artifact_type   TEXT NOT NULL DEFAULT 'code' CHECK (artifact_type IN ('code', 'html', 'document', 'diagram', 'react', 'svg', 'mermaid', 'markdown')),
  file_path       TEXT,
  line_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. TABLES (Analytics & Tracking)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.user_sessions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_token     TEXT,
  started_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  ended_at          TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT true,
  ip_address        TEXT,
  user_agent        TEXT,
  device_type       TEXT,
  browser           TEXT,
  os                TEXT,
  timezone          TEXT,
  country           TEXT,
  city              TEXT,
  messages_sent     INTEGER DEFAULT 0,
  tokens_used       INTEGER DEFAULT 0,
  artifacts_created INTEGER DEFAULT 0,
  ended_reason      TEXT
);

CREATE TABLE public.user_events (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id      UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id      TEXT,
  event_type      TEXT NOT NULL,
  event_name      TEXT NOT NULL,
  properties      JSONB DEFAULT '{}'::jsonb,
  view            TEXT,
  device_type     TEXT,
  timezone        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.user_query_log (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id        UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  conversation_id   UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id        TEXT,
  prompt_text       TEXT NOT NULL,
  prompt_length     INTEGER     DEFAULT 0,
  response_text     TEXT,
  response_length   INTEGER     DEFAULT 0,
  intent            TEXT,
  agent_type        TEXT,
  agent_provider    TEXT,
  model_requested   TEXT,
  model_used        TEXT,
  engine            TEXT,
  input_tokens      INTEGER     DEFAULT 0,
  output_tokens     INTEGER     DEFAULT 0,
  total_tokens      INTEGER     DEFAULT 0,
  response_time_ms  INTEGER     DEFAULT 0,
  has_image         BOOLEAN     DEFAULT false,
  has_documents     BOOLEAN     DEFAULT false,
  has_codebase_ref  BOOLEAN     DEFAULT false,
  artifact_created  BOOLEAN     DEFAULT false,
  artifact_id       TEXT,
  confidence_level  TEXT,
  feedback          TEXT CHECK (feedback IN ('good', 'bad', NULL)),
  was_regenerated   BOOLEAN     DEFAULT false,
  was_edited        BOOLEAN     DEFAULT false,
  slash_command     TEXT,
  had_error         BOOLEAN     DEFAULT false,
  error_type        TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.user_daily_metrics (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date              DATE NOT NULL,
  messages_sent     INTEGER DEFAULT 0,
  queries_made      INTEGER DEFAULT 0,
  sessions_count    INTEGER DEFAULT 0,
  active_minutes    INTEGER DEFAULT 0,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  total_tokens      INTEGER DEFAULT 0,
  gemini_queries    INTEGER DEFAULT 0,
  claude_queries    INTEGER DEFAULT 0,
  openai_queries    INTEGER DEFAULT 0,
  coding_queries    INTEGER DEFAULT 0,
  reasoning_queries INTEGER DEFAULT 0,
  live_queries      INTEGER DEFAULT 0,
  general_queries   INTEGER DEFAULT 0,
  artifacts_created INTEGER DEFAULT 0,
  good_feedback     INTEGER DEFAULT 0,
  bad_feedback      INTEGER DEFAULT 0,
  regenerations     INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE public.admin_audit_log (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email    TEXT,
  action         TEXT NOT NULL,
  target_user_id UUID,
  target_email   TEXT,
  details        JSONB DEFAULT '{}'::jsonb,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE public.file_uploads (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id   UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id        TEXT,
  bucket            TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  public_url        TEXT,
  original_name     TEXT NOT NULL,
  file_type         TEXT NOT NULL,
  mime_type         TEXT,
  file_size_bytes   BIGINT DEFAULT 0,
  is_deleted        BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. STORAGE BUCKETS & POLICIES
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sedrex-uploads', 'sedrex-uploads', false, 52428800,
  ARRAY[
    'image/jpeg','image/jpg','image/png','image/webp','image/gif',
    'application/pdf','text/plain','text/csv','text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel','application/msword','application/json'
  ]
) ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sedrex-avatars', 'sedrex-avatars', true, 5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
) ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sedrex-artifacts', 'sedrex-artifacts', false, 10485760,
  ARRAY[
    'text/plain','text/html','text/css','text/markdown',
    'application/javascript','application/json',
    'text/x-python','text/x-typescript','application/octet-stream'
  ]
) ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS

CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sedrex-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sedrex-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sedrex-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sedrex-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Anyone read avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'sedrex-avatars');
CREATE POLICY "Users delete own avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sedrex-avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own artifacts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sedrex-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own artifacts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sedrex-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own artifacts" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sedrex-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_query_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_uploads        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for profiles" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Enable all for user_stats" ON public.user_stats FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable all for user_preferences" ON public.user_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own conversations" ON public.conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own messages" ON public.messages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.conversations WHERE conversations.id = messages.conversation_id AND conversations.user_id = auth.uid())
);
CREATE POLICY "Users manage own artifacts" ON public.artifacts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own file records" ON public.file_uploads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own sessions" ON public.user_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own events" ON public.user_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own queries" ON public.user_query_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own metrics" ON public.user_daily_metrics FOR ALL USING (auth.uid() = user_id);

-- Admin read-all policies
CREATE POLICY "Admins view all sessions" ON public.user_sessions FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins view all events" ON public.user_events FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins view all queries" ON public.user_query_log FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins view all metrics" ON public.user_daily_metrics FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Admins manage audit log" ON public.admin_audit_log FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));


-- ════════════════════════════════════════════════════════════════════════════
-- 6. TRIGGERS & FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════

-- Auth Signup Handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, display_name, tier, created_at, updated_at)
  VALUES (
    NEW.id, NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Sedrex User'), 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Sedrex User'), 
    'free', NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_stats (user_id, tier) VALUES (NEW.id, 'free') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'handle_new_user: %', SQLERRM; RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Automatic updated_at functionality
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_user_prefs_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
CREATE TRIGGER trg_artifacts_updated_at BEFORE UPDATE ON public.artifacts FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- Conversation metrics update on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations SET
    last_modified = NOW(),
    message_count = COALESCE(message_count, 0) + 1,
    total_tokens  = COALESCE(total_tokens, 0) + COALESCE(NEW.input_tokens, 0) + COALESCE(NEW.output_tokens, 0),
    total_input_tokens = COALESCE(total_input_tokens, 0) + COALESCE(NEW.input_tokens, 0),
    total_output_tokens = COALESCE(total_output_tokens, 0) + COALESCE(NEW.output_tokens, 0)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_conversation_on_message: %', SQLERRM; RETURN NEW;
END; $$;

CREATE TRIGGER trg_message_updates_conversation AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- Profile last seen update on session end
CREATE OR REPLACE FUNCTION update_profile_on_session_end()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false AND NEW.ended_at IS NOT NULL THEN
    UPDATE public.profiles SET
      last_seen_at   = NEW.ended_at,
      total_sessions = COALESCE(total_sessions, 0) + 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_session_end_updates_profile AFTER UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION update_profile_on_session_end();

-- Daily metrics aggregation from user_query_log
CREATE OR REPLACE FUNCTION update_daily_metrics()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
DECLARE v_date DATE := DATE(NEW.created_at);
BEGIN
  INSERT INTO public.user_daily_metrics (
    user_id, date, queries_made, input_tokens, output_tokens, total_tokens,
    gemini_queries, claude_queries, openai_queries, coding_queries, reasoning_queries, live_queries, general_queries,
    artifacts_created, good_feedback, bad_feedback, regenerations
  ) VALUES (
    NEW.user_id, v_date, 1, COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0), COALESCE(NEW.total_tokens,0),
    CASE WHEN NEW.model_used ILIKE '%gemini%' THEN 1 ELSE 0 END,
    CASE WHEN NEW.model_used ILIKE '%claude%' THEN 1 ELSE 0 END,
    CASE WHEN NEW.model_used ILIKE '%gpt%' OR NEW.model_used ILIKE '%openai%' THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='coding' THEN 1 ELSE 0 END, CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='live' THEN 1 ELSE 0 END, CASE WHEN NEW.intent='general' THEN 1 ELSE 0 END,
    CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END, CASE WHEN NEW.feedback='good' THEN 1 ELSE 0 END,
    CASE WHEN NEW.feedback='bad' THEN 1 ELSE 0 END, CASE WHEN NEW.was_regenerated THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    queries_made      = user_daily_metrics.queries_made + 1,
    input_tokens      = user_daily_metrics.input_tokens + COALESCE(NEW.input_tokens,0),
    output_tokens     = user_daily_metrics.output_tokens + COALESCE(NEW.output_tokens,0),
    total_tokens      = user_daily_metrics.total_tokens + COALESCE(NEW.total_tokens,0),
    gemini_queries    = user_daily_metrics.gemini_queries + CASE WHEN NEW.model_used ILIKE '%gemini%' THEN 1 ELSE 0 END,
    claude_queries    = user_daily_metrics.claude_queries + CASE WHEN NEW.model_used ILIKE '%claude%' THEN 1 ELSE 0 END,
    openai_queries    = user_daily_metrics.openai_queries + CASE WHEN NEW.model_used ILIKE '%gpt%' OR NEW.model_used ILIKE '%openai%' THEN 1 ELSE 0 END,
    coding_queries    = user_daily_metrics.coding_queries + CASE WHEN NEW.intent='coding' THEN 1 ELSE 0 END,
    reasoning_queries = user_daily_metrics.reasoning_queries + CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END,
    live_queries      = user_daily_metrics.live_queries + CASE WHEN NEW.intent='live' THEN 1 ELSE 0 END,
    general_queries   = user_daily_metrics.general_queries + CASE WHEN NEW.intent='general' THEN 1 ELSE 0 END,
    artifacts_created = user_daily_metrics.artifacts_created + CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END,
    good_feedback     = user_daily_metrics.good_feedback + CASE WHEN NEW.feedback='good' THEN 1 ELSE 0 END,
    bad_feedback      = user_daily_metrics.bad_feedback + CASE WHEN NEW.feedback='bad' THEN 1 ELSE 0 END,
    regenerations     = user_daily_metrics.regenerations + CASE WHEN NEW.was_regenerated THEN 1 ELSE 0 END;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_query_log_daily_metrics AFTER INSERT ON public.user_query_log FOR EACH ROW EXECUTE FUNCTION update_daily_metrics();

-- User Stats aggregation from user_query_log
CREATE OR REPLACE FUNCTION update_user_stats_on_query()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.user_stats SET
    total_messages           = COALESCE(total_messages,0) + 1,
    monthly_messages         = COALESCE(monthly_messages,0) + 1,
    tokens_estimated         = COALESCE(tokens_estimated,0) + COALESCE(NEW.total_tokens,0),
    total_input_tokens       = COALESCE(total_input_tokens,0) + COALESCE(NEW.input_tokens,0),
    total_output_tokens      = COALESCE(total_output_tokens,0) + COALESCE(NEW.output_tokens,0),
    last_message_at          = NEW.created_at,
    first_message_at         = COALESCE(first_message_at, NEW.created_at),
    total_artifacts          = COALESCE(total_artifacts,0) + CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END,
    total_code_requests      = COALESCE(total_code_requests,0) + CASE WHEN NEW.intent='coding' THEN 1 ELSE 0 END,
    total_live_requests      = COALESCE(total_live_requests,0) + CASE WHEN NEW.intent='live' THEN 1 ELSE 0 END,
    total_reasoning_requests = COALESCE(total_reasoning_requests,0) + CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END,
    model_usage = jsonb_set(
      COALESCE(model_usage,'{}'::jsonb),
      ARRAY[COALESCE(NEW.model_used,'unknown')],
      to_jsonb(COALESCE((model_usage->>COALESCE(NEW.model_used,'unknown'))::int,0)+1)
    )
  WHERE user_id = NEW.user_id;

  UPDATE public.profiles SET
    total_tokens_lifetime = COALESCE(total_tokens_lifetime,0) + COALESCE(NEW.total_tokens,0)
  WHERE id = NEW.user_id;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_query_log_user_stats AFTER INSERT ON public.user_query_log FOR EACH ROW EXECUTE FUNCTION update_user_stats_on_query();


-- ════════════════════════════════════════════════════════════════════════════
-- 7. ADMIN VIEWS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.admin_user_summary AS
SELECT
  p.id                                                               AS user_id,
  u.email                                                            AS email,
  COALESCE(p.tier, 'free')                                           AS tier,
  COALESCE(p.is_admin, false)                                        AS is_admin,
  COALESCE(p.is_banned, false)                                       AS is_banned,
  p.last_seen_at,
  COALESCE(p.total_sessions, 0)                                      AS total_sessions,
  COALESCE(p.total_tokens_lifetime, 0)                               AS total_tokens_lifetime,
  p.timezone,  p.country,  p.city,  p.device_type,  p.browser,
  COALESCE(p.signup_source, 'email')                                 AS signup_source,
  u.created_at                                                       AS signup_at,
  COALESCE(us.total_messages, 0)                                     AS total_messages,
  COALESCE(us.monthly_messages, 0)                                   AS monthly_messages,
  COALESCE(us.total_input_tokens, 0)                                 AS total_input_tokens,
  COALESCE(us.total_output_tokens, 0)                                AS total_output_tokens,
  COALESCE(us.total_input_tokens,0)+COALESCE(us.total_output_tokens,0) AS lifetime_tokens,
  COALESCE(us.avg_session_minutes, 0)                                AS avg_session_minutes,
  us.favorite_model,
  COALESCE(us.total_artifacts, 0)                                    AS total_artifacts,
  COALESCE(us.total_code_requests, 0)                                AS total_code_requests,
  COALESCE(us.total_live_requests, 0)                                AS total_live_requests,
  COALESCE(us.total_reasoning_requests, 0)                           AS total_reasoning_requests,
  us.first_message_at,  us.last_message_at,
  COALESCE(us.streak_days, 0)                                        AS streak_days,
  (SELECT COUNT(*) FROM public.user_sessions s WHERE s.user_id = p.id AND s.is_active = true) AS active_sessions,
  COALESCE((SELECT dm.queries_made FROM public.user_daily_metrics dm WHERE dm.user_id = p.id AND dm.date = CURRENT_DATE LIMIT 1), 0) AS queries_today,
  COALESCE((SELECT dm.total_tokens FROM public.user_daily_metrics dm WHERE dm.user_id = p.id AND dm.date = CURRENT_DATE LIMIT 1), 0) AS tokens_today
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.user_stats us ON us.user_id = p.id;

CREATE OR REPLACE VIEW public.admin_platform_daily AS
SELECT
  date,
  COUNT(DISTINCT user_id)              AS active_users,
  SUM(queries_made)                    AS total_queries,
  SUM(total_tokens)                    AS total_tokens,
  SUM(input_tokens)                    AS total_input_tokens,
  SUM(output_tokens)                   AS total_output_tokens,
  SUM(sessions_count)                  AS total_sessions,
  SUM(active_minutes)                  AS total_active_minutes,
  SUM(gemini_queries)                  AS gemini_queries,
  SUM(claude_queries)                  AS claude_queries,
  SUM(openai_queries)                  AS openai_queries,
  SUM(coding_queries)                  AS coding_queries,
  SUM(reasoning_queries)               AS reasoning_queries,
  SUM(live_queries)                    AS live_queries,
  SUM(general_queries)                 AS general_queries,
  SUM(artifacts_created)               AS artifacts_created,
  SUM(good_feedback)                   AS good_feedback,
  SUM(bad_feedback)                    AS bad_feedback,
  SUM(regenerations)                   AS regenerations,
  ROUND(AVG(queries_made)::NUMERIC, 2) AS avg_queries_per_user
FROM public.user_daily_metrics
GROUP BY date ORDER BY date DESC;

CREATE OR REPLACE VIEW public.admin_user_queries AS
SELECT
  ql.id, ql.user_id,
  u.email,
  ql.session_id, ql.conversation_id,
  c.title                                                       AS conversation_title,
  ql.prompt_text, COALESCE(ql.prompt_length, LENGTH(ql.prompt_text)) AS prompt_length,
  ql.response_text, COALESCE(ql.response_length, LENGTH(COALESCE(ql.response_text,''))) AS response_length,
  ql.intent, ql.agent_type, ql.model_used, ql.engine,
  COALESCE(ql.input_tokens,0)         AS input_tokens,
  COALESCE(ql.output_tokens,0)        AS output_tokens,
  COALESCE(ql.total_tokens,0)         AS total_tokens,
  COALESCE(ql.response_time_ms,0)     AS response_time_ms,
  COALESCE(ql.has_image,false)        AS has_image,
  COALESCE(ql.has_documents,false)    AS has_documents,
  COALESCE(ql.has_codebase_ref,false) AS has_codebase_ref,
  COALESCE(ql.artifact_created,false) AS artifact_created,
  ql.confidence_level, ql.feedback,
  COALESCE(ql.was_regenerated,false)  AS was_regenerated,
  COALESCE(ql.was_edited,false)       AS was_edited,
  ql.slash_command,
  COALESCE(ql.had_error,false)        AS had_error,
  ql.error_type, ql.created_at
FROM public.user_query_log ql
JOIN auth.users u ON u.id = ql.user_id
LEFT JOIN public.conversations c ON c.id = ql.conversation_id
ORDER BY ql.created_at DESC;

CREATE OR REPLACE VIEW public.admin_user_sessions AS
SELECT
  s.id, s.user_id,
  u.email,
  s.started_at, s.ended_at,
  CASE WHEN s.ended_at IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::NUMERIC / 60, 1)
       ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - s.started_at))::NUMERIC / 60, 1) END AS duration_minutes,
  s.is_active, s.device_type, s.browser, s.os, s.ip_address,
  s.timezone, s.country, s.city,
  COALESCE(s.messages_sent,0)      AS messages_sent,
  COALESCE(s.tokens_used,0)        AS tokens_used,
  COALESCE(s.artifacts_created,0)  AS artifacts_created,
  s.ended_reason
FROM public.user_sessions s
JOIN auth.users u ON u.id = s.user_id
ORDER BY s.started_at DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. INDEXES & GRANTS
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_conversations_user ON public.conversations(user_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_user_sessions_user_active ON public.user_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_user_events_user_created ON public.user_events(user_id, created_at DESC);
CREATE INDEX idx_query_log_user_created ON public.user_query_log(user_id, created_at DESC);
CREATE INDEX idx_file_uploads_user ON public.file_uploads(user_id);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Make yourself admin if the email exists already
UPDATE public.profiles SET is_admin = true, tier = 'unlimited' WHERE email = 'unicorntales2@gmail.com';
UPDATE public.user_stats SET tier = 'unlimited', subscription_status = 'admin', tokens_remaining = 999999999 WHERE user_id IN (SELECT id FROM public.profiles WHERE email = 'unicorntales2@gmail.com');

COMMIT;
