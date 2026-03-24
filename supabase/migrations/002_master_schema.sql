-- ════════════════════════════════════════════════════════════════════════════
-- SEDREX AI — ELITE DATABASE v2.0
-- One file. Run once. Never touch again.
--
-- ANALYSED FROM YOUR ACTUAL SOURCE CODE:
--   apiService.ts         → exact columns written to messages, conversations
--   artifactStore.ts      → writes to generated_code, generated_diagrams, generated_images
--   queryOptimizer.ts     → reads base64_data from generated_images (kept)
--   analyticsService.ts   → writes to user_query_log, user_events, user_sessions
--
-- BUGS FIXED FROM YOUR SHARED ELITE SCRIPT (Document 6):
--   ❌ BUG 1: feature_flags used COALESCE() in PRIMARY KEY — illegal in Postgres
--      FIX: surrogate UUID primary key + two partial unique indexes (Option B)
--   ❌ BUG 2: generated_images had no base64_data column
--      FIX: KEPT base64_data because queryOptimizer.ts reads r.base64_data at line 34106
--      The app REQUIRES this column. Removing it breaks artifact loading.
--   ❌ BUG 3: messages table missing image_data, grounding_chunks columns
--      FIX: KEPT both — apiService.ts line 30520 inserts image_data, line 30522 inserts
--      grounding_chunks, queryOptimizer.ts line 34125 SELECTs them.
--      Removing them crashes saveMessage() on every AI response.
--   ❌ BUG 4: user_daily_metrics trigger referenced diagram_created but INSERT uses
--      diagrams_created — column name mismatch
--      FIX: column standardised to diagrams_created throughout
--   ❌ BUG 5: update_daily_metrics trigger used "CASE WHEN NEW.intent IN ('general',NULL)"
--      FIX: NULL can't be in an IN() list. Fixed to: NEW.intent='general' OR NEW.intent IS NULL
--   ❌ BUG 6: No user_auth_events INSERT trigger — auth events need app-side tracking
--      (Supabase does not auto-trigger your custom tables on auth.users changes)
--      FIX: Documented clearly. handle_new_user() now correctly fires on signup.
--
-- EGRESS ARCHITECTURE (free tier 5GB/month):
--   messages:      content stored in full (core value, never strip)
--                  image_data: JSONB (small base64 thumbnails OK, full images → bucket)
--                  grounding_chunks: 3 sources max (app controls this, not DB)
--   query_log:     prompt_text VARCHAR(500), NO response_text column
--   generated_images: base64_data kept (queryOptimizer reads it) — app should
--                  upload large images to bucket and store path here instead
--   user_events:   all clicks tracked — analyticsService.ts controls volume
--
-- TOKEN SYSTEM — MANUALLY EDITABLE:
--   Table: token_budgets
--   Edit:  remaining_tokens, total_token_limit, is_unlimited
--   Where: Supabase → Table Editor → token_budgets → find user → edit
--
-- RUN ORDER: STEP 2 wipe → STEP 3 this file → STEP 4 import
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"  SCHEMA public;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. PROFILES — master user record
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id                    UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email                 TEXT UNIQUE,
  full_name             TEXT,
  display_name          TEXT,
  avatar_url            TEXT,

  -- Access control (EDIT THESE IN TABLE EDITOR)
  tier                  TEXT    DEFAULT 'free' CHECK (tier IN ('free','pro','unlimited','admin')),
  is_admin              BOOLEAN DEFAULT false,
  is_banned             BOOLEAN DEFAULT false,
  ban_reason            TEXT,
  ban_expires_at        TIMESTAMPTZ,

  -- Location & device
  timezone              TEXT    DEFAULT 'UTC',
  country               TEXT,
  country_code          TEXT,
  city                  TEXT,
  region                TEXT,
  device_type           TEXT,
  browser               TEXT,
  os                    TEXT,
  ip_address            TEXT,

  -- Signup
  signup_source         TEXT    DEFAULT 'email',
  signup_ip             TEXT,
  referrer              TEXT,
  onboarding_completed  BOOLEAN DEFAULT false,
  survey_completed      BOOLEAN DEFAULT false,

  -- Activity (auto-updated by triggers)
  last_seen_at          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  last_message_at       TIMESTAMPTZ,
  total_sessions        INTEGER DEFAULT 0,
  total_logins          INTEGER DEFAULT 0,
  total_tokens_lifetime BIGINT  DEFAULT 0,  -- AUTO: updated by trigger

  -- Preferences cache
  preferred_model       TEXT    DEFAULT 'auto',
  personification       TEXT    DEFAULT 'Precise and verification-first',

  -- Admin
  admin_notes           TEXT,
  phone_number          TEXT,   -- future SMS auth

  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.profiles.tier        IS 'EDITABLE in Table Editor: free|pro|unlimited|admin';
COMMENT ON COLUMN public.profiles.is_admin    IS 'EDITABLE: true = admin dashboard access';
COMMENT ON COLUMN public.profiles.is_banned   IS 'EDITABLE: true = user blocked from app';
COMMENT ON COLUMN public.profiles.admin_notes IS 'EDITABLE: your private notes about this user';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. USER PREFERENCES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  theme                     TEXT    DEFAULT 'dark' CHECK (theme IN ('light','dark','auto')),
  language                  TEXT    DEFAULT 'en',
  font_size                 TEXT    DEFAULT 'medium',
  default_model             TEXT    DEFAULT 'auto',
  response_format           TEXT    DEFAULT 'balanced',
  personification           TEXT    DEFAULT 'Precise and verification-first',
  custom_instructions       TEXT,
  enable_web_search         BOOLEAN DEFAULT true,
  enable_artifacts          BOOLEAN DEFAULT true,
  enable_follow_up          BOOLEAN DEFAULT true,
  enable_memory             BOOLEAN DEFAULT true,
  sidebar_collapsed         BOOLEAN DEFAULT false,
  share_data_for_training   BOOLEAN DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. USER MEMORY — ChatGPT-style persistent memory
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_memory (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  memory_type     TEXT NOT NULL CHECK (memory_type IN (
    'fact','preference','context','correction','goal','feedback','relationship'
  )),
  content         TEXT NOT NULL,
  conversation_id UUID,
  confidence      NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  is_active       BOOLEAN DEFAULT true,
  used_count      INTEGER DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  approved_for_training BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.user_memory IS
'ChatGPT-style memory per user. Each row = one remembered fact/preference.
Set is_active=false to soft-delete. Set approved_for_training=true for fine-tuning.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. TOKEN BUDGETS — manually editable from Supabase Table Editor
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.token_budgets (
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,

  -- ══ EDIT THESE IN TABLE EDITOR ══════════════════════════════════════════
  total_token_limit   BIGINT  DEFAULT 100000,
  remaining_tokens    BIGINT  DEFAULT 100000,   -- deducted by trigger on each query
  is_unlimited        BOOLEAN DEFAULT false,     -- true = no limits (admin/pro)
  enforce_limit       BOOLEAN DEFAULT true,
  reset_period        TEXT    DEFAULT 'monthly'
    CHECK (reset_period IN ('daily','weekly','monthly','never')),
  tokens_per_day      INTEGER DEFAULT 0,         -- 0 = use monthly limit only
  -- ════════════════════════════════════════════════════════════════════════

  last_reset_at       TIMESTAMPTZ DEFAULT now(),
  next_reset_at       TIMESTAMPTZ,
  tokens_used_today   BIGINT  DEFAULT 0,   -- auto-updated by trigger
  tokens_used_month   BIGINT  DEFAULT 0,   -- auto-updated by trigger
  tokens_used_total   BIGINT  DEFAULT 0,   -- auto-updated by trigger
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.token_budgets IS
'EDITABLE: Go to Table Editor → token_budgets → find user row → edit.
remaining_tokens: deducted automatically on every query.
is_unlimited=true: bypasses all token checks.
total_token_limit: the cap to enforce.';
COMMENT ON COLUMN public.token_budgets.remaining_tokens IS 'EDITABLE: decrease or replenish manually';
COMMENT ON COLUMN public.token_budgets.is_unlimited     IS 'EDITABLE: true = unlimited for this user';
COMMENT ON COLUMN public.token_budgets.total_token_limit IS 'EDITABLE: total cap';

-- Per-model token breakdown
CREATE TABLE IF NOT EXISTS public.model_token_summary (
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model               TEXT NOT NULL,
  model_provider      TEXT NOT NULL,
  total_input_tokens  BIGINT  DEFAULT 0,
  total_output_tokens BIGINT  DEFAULT 0,
  total_tokens        BIGINT  DEFAULT 0,
  query_count         INTEGER DEFAULT 0,
  error_count         INTEGER DEFAULT 0,
  last_used_at        TIMESTAMPTZ,
  PRIMARY KEY (user_id, model)
);

COMMENT ON TABLE public.model_token_summary IS
'Per-user per-model token totals. Auto-updated by trigger.
Shows: how many Gemini vs Claude vs GPT tokens each user consumed.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. USER STATS — fast-read aggregates
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  tier                     TEXT DEFAULT 'free',
  total_messages           INTEGER DEFAULT 0,
  monthly_messages         INTEGER DEFAULT 0,
  tokens_estimated         INTEGER DEFAULT 0,
  total_input_tokens       BIGINT  DEFAULT 0,
  total_output_tokens      BIGINT  DEFAULT 0,
  total_conversations      INTEGER DEFAULT 0,
  total_artifacts          INTEGER DEFAULT 0,
  total_code_requests      INTEGER DEFAULT 0,
  total_live_requests      INTEGER DEFAULT 0,
  total_reasoning_requests INTEGER DEFAULT 0,
  total_good_feedback      INTEGER DEFAULT 0,
  total_bad_feedback       INTEGER DEFAULT 0,
  streak_days              INTEGER DEFAULT 0,
  longest_streak           INTEGER DEFAULT 0,
  favorite_model           TEXT,
  first_message_at         TIMESTAMPTZ,
  last_message_at          TIMESTAMPTZ,
  model_usage              JSONB DEFAULT '{}'::jsonb,
  daily_history            JSONB DEFAULT '[]'::jsonb  -- kept for backward compat
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. AUTH EVENTS — every login, logout, signup, OAuth event
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_auth_events (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'signup_email','signup_google','signup_github','signup_facebook','signup_phone',
    'login_email','login_google','login_github','login_facebook','login_phone',
    'logout','session_expired','password_reset_request','password_reset_complete',
    'email_verified','phone_verified','login_failed','signup_failed','rate_limited',
    'account_deleted','account_banned'
  )),
  provider      TEXT,
  success       BOOLEAN DEFAULT true,
  failure_reason TEXT,
  ip_address    TEXT,
  device_type   TEXT,
  browser       TEXT,
  os            TEXT,
  country       TEXT,
  city          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.user_auth_events IS
'Permanent auth audit trail — never purged.
Populated by: handle_new_user() trigger on signup.
App-side: analyticsService must call this for login/logout events.';

-- ════════════════════════════════════════════════════════════════════════════
-- 7. CONVERSATIONS & MESSAGES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.conversations (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title                   TEXT DEFAULT 'New Chat',
  summary                 TEXT,
  is_favorite             BOOLEAN DEFAULT false,
  is_archived             BOOLEAN DEFAULT false,
  is_pinned               BOOLEAN DEFAULT false,
  folder_id               UUID,
  tags                    TEXT[]  DEFAULT '{}',
  preferred_model         TEXT    DEFAULT 'auto',
  model_used              TEXT,
  intent                  TEXT,
  agent_type              TEXT,
  message_count           INTEGER DEFAULT 0,
  user_message_count      INTEGER DEFAULT 0,
  assistant_message_count INTEGER DEFAULT 0,
  total_tokens            INTEGER DEFAULT 0,
  total_input_tokens      BIGINT  DEFAULT 0,
  total_output_tokens     BIGINT  DEFAULT 0,
  artifact_count          INTEGER DEFAULT 0,
  has_images              BOOLEAN DEFAULT false,
  has_documents           BOOLEAN DEFAULT false,
  has_artifacts           BOOLEAN DEFAULT false,
  has_code                BOOLEAN DEFAULT false,
  approved_for_training   BOOLEAN DEFAULT false,
  created_at              TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_modified           TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- MESSAGES — preserving all columns that apiService.ts and queryOptimizer.ts use
-- image_data and grounding_chunks KEPT because:
--   apiService.ts line 30520: inserts image_data
--   apiService.ts line 30522: inserts grounding_chunks
--   queryOptimizer.ts line 34125: SELECTs both columns
-- Removing them = silent crash on every AI response
CREATE TABLE IF NOT EXISTS public.messages (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id     UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  parent_message_id   UUID REFERENCES public.messages(id),

  role                TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content             TEXT NOT NULL,           -- full content always stored
  content_length      INTEGER DEFAULT 0,       -- auto-populated by trigger

  model               TEXT,
  model_provider      TEXT,
  is_auto_selected    BOOLEAN DEFAULT false,
  intent              TEXT,
  agent_type          TEXT,
  agent_provider      TEXT,
  confidence_level    TEXT,
  routing_reason      TEXT,

  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  tokens_used         INTEGER DEFAULT 0,
  response_time_ms    INTEGER DEFAULT 0,

  -- KEPT: apiService.ts reads/writes image_data
  -- Store small inline images here; large ones → sedrex-uploads bucket
  image_data          JSONB,

  -- Document metadata (titles + paths, not full extracted content)
  documents           JSONB DEFAULT '[]'::jsonb,

  -- KEPT: apiService.ts reads/writes grounding_chunks
  -- analyticsService keeps this to 3 sources max
  grounding_chunks    JSONB DEFAULT '[]'::jsonb,

  -- Routing metadata
  metadata            JSONB DEFAULT '{}'::jsonb,

  -- Artifact flags
  has_artifacts       BOOLEAN DEFAULT false,
  artifact_count      INTEGER DEFAULT 0,
  artifact_id         UUID,

  -- Codebase reference
  codebase_ref        JSONB,
  has_codebase_ref    BOOLEAN DEFAULT false,

  -- File flags
  has_image           BOOLEAN DEFAULT false,
  has_documents       BOOLEAN DEFAULT false,
  attachment_count    INTEGER DEFAULT 0,

  feedback            TEXT CHECK (feedback IN ('good','bad',NULL)),
  feedback_comment    TEXT,
  feedback_at         TIMESTAMPTZ,
  slash_command       TEXT,
  was_regenerated     BOOLEAN DEFAULT false,
  was_edited          BOOLEAN DEFAULT false,
  error_message       TEXT,

  approved_for_training BOOLEAN DEFAULT false,
  timestamp           TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.messages.image_data IS
'Small inline images as JSONB. For large images (>100KB), upload to sedrex-uploads
bucket and store the path in metadata.generatedImageUrl instead.';
COMMENT ON COLUMN public.messages.grounding_chunks IS
'Web search sources. Keep to max 3-5 items to control row size.';

-- ════════════════════════════════════════════════════════════════════════════
-- 8. ARTIFACTS & GENERATED CONTENT
-- ════════════════════════════════════════════════════════════════════════════

-- Generic artifacts table
CREATE TABLE IF NOT EXISTS public.artifacts (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  language        TEXT NOT NULL DEFAULT 'text',
  artifact_type   TEXT NOT NULL DEFAULT 'code' CHECK (artifact_type IN (
    'code','html','react','svg','markdown','document','diagram','mermaid',
    'image','csv','json','shell'
  )),
  content         TEXT NOT NULL DEFAULT '',
  line_count      INTEGER DEFAULT 0,
  version         INTEGER DEFAULT 1,
  storage_path    TEXT,
  view_count      INTEGER DEFAULT 0,
  copy_count      INTEGER DEFAULT 0,
  download_count  INTEGER DEFAULT 0,
  preview_count   INTEGER DEFAULT 0,
  approved_for_training BOOLEAN DEFAULT false,
  labels          TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Code artifacts — artifactStore.ts createArtifact() writes here
CREATE TABLE IF NOT EXISTS public.generated_code (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id      UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  language        TEXT NOT NULL DEFAULT 'text',
  code_content    TEXT NOT NULL,
  artifact_type   TEXT NOT NULL DEFAULT 'code',
  file_path       TEXT,
  line_count      INTEGER DEFAULT 0,
  version         INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Diagram artifacts — artifactStore.ts storeDiagram() writes here
CREATE TABLE IF NOT EXISTS public.generated_diagrams (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id      UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  language        TEXT NOT NULL DEFAULT 'mermaid',
  mermaid_code    TEXT NOT NULL,
  artifact_type   TEXT NOT NULL DEFAULT 'diagram',
  file_path       TEXT,
  line_count      INTEGER DEFAULT 0,
  version         INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Image artifacts — artifactStore.ts storeImage() writes here
-- base64_data KEPT because queryOptimizer.ts line ~34106 reads: r.base64_data
-- Removing this column breaks getAllUserArtifactsByUserId()
-- Future: upload to bucket and store storage_path instead
CREATE TABLE IF NOT EXISTS public.generated_images (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id      UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  language        TEXT NOT NULL DEFAULT 'png',
  artifact_type   TEXT NOT NULL DEFAULT 'image',
  file_path       TEXT,
  line_count      INTEGER DEFAULT 0,

  -- base64_data: kept for backward compat with queryOptimizer.ts
  -- IMPORTANT: for new images, upload to sedrex-uploads bucket instead
  -- Set base64_data='[use-storage-path]' and populate storage_path + storage_url
  base64_data     TEXT,
  storage_path    TEXT,    -- preferred: path in sedrex-uploads bucket
  public_url      TEXT,    -- signed URL (regenerated on access)
  bucket          TEXT DEFAULT 'sedrex-uploads',
  mime_type       TEXT DEFAULT 'image/png',
  file_size_bytes BIGINT DEFAULT 0,
  width_px        INTEGER,
  height_px       INTEGER,

  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.generated_images.base64_data IS
'LEGACY: queryOptimizer.ts reads this. New images: upload to sedrex-uploads bucket,
set storage_path here, and set base64_data to null or a short placeholder.';
COMMENT ON COLUMN public.generated_images.storage_path IS
'PREFERRED: Path in sedrex-uploads bucket. Use supabase.storage.createSignedUrl() to serve.';

-- ════════════════════════════════════════════════════════════════════════════
-- 9. FILE UPLOADS — all user files, all types, storage paths only
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.file_uploads (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id   UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id        UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  original_name     TEXT NOT NULL,
  display_name      TEXT,
  bucket            TEXT NOT NULL DEFAULT 'sedrex-uploads',
  storage_path      TEXT NOT NULL,
  public_url        TEXT,
  file_type         TEXT NOT NULL CHECK (file_type IN (
    'image','pdf','document','spreadsheet','presentation','code',
    'text','audio','video','archive','data','other'
  )),
  mime_type         TEXT,
  extension         TEXT,
  file_size_bytes   BIGINT DEFAULT 0,
  file_size_human   TEXT,
  width_px          INTEGER,
  height_px         INTEGER,
  thumbnail_url     TEXT,
  page_count        INTEGER,
  word_count        INTEGER,
  upload_status     TEXT DEFAULT 'complete'
    CHECK (upload_status IN ('pending','uploading','complete','failed','deleted')),
  is_deleted        BOOLEAN DEFAULT false,
  access_count      INTEGER DEFAULT 0,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.file_uploads IS
'Every file uploaded by every user. No file content in DB — only metadata + storage paths.
Actual files in sedrex-uploads bucket, organized as: {user_id}/{type}/{filename}
Browse in Supabase: Storage → sedrex-uploads → click user folder.';

-- ════════════════════════════════════════════════════════════════════════════
-- 10. ANALYTICS & TRACKING
-- ════════════════════════════════════════════════════════════════════════════

-- Sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  auth_session_id   TEXT,
  started_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER,
  is_active         BOOLEAN DEFAULT true,
  ip_address        TEXT,
  device_type       TEXT,
  browser           TEXT,
  os                TEXT,
  timezone          TEXT,
  country           TEXT,
  city              TEXT,
  messages_sent     INTEGER DEFAULT 0,
  tokens_used       BIGINT  DEFAULT 0,
  artifacts_created INTEGER DEFAULT 0,
  files_uploaded    INTEGER DEFAULT 0,
  ended_reason      TEXT CHECK (ended_reason IN ('logout','timeout','tab_close','session_expired',NULL))
);

-- User events — EVERY click, navigation, model selection, setting change
-- analyticsService.ts controls event_category filtering
-- All categories tracked: click|navigation|model|artifact|file|auth|setting|error|feedback
CREATE TABLE IF NOT EXISTS public.user_events (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id      UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  event_category  TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  event_value     TEXT,
  event_label     TEXT,
  page_view       TEXT,
  component       TEXT,
  properties      JSONB DEFAULT '{}'::jsonb,
  device_type     TEXT,
  timezone        TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Query log — lean version
-- prompt_text: VARCHAR(500) cap — full text in messages.content
-- NO response_text column — responses read from messages table
CREATE TABLE IF NOT EXISTS public.user_query_log (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id        UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  conversation_id   UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id        UUID REFERENCES public.messages(id) ON DELETE SET NULL,

  prompt_text       VARCHAR(500),   -- capped: full text is in messages.content
  intent            TEXT,
  agent_type        TEXT,
  agent_provider    TEXT,
  model_requested   TEXT,
  model_used        TEXT NOT NULL DEFAULT 'unknown',
  model_provider    TEXT,
  engine            TEXT,
  is_fallback       BOOLEAN DEFAULT false,
  slash_command     TEXT,

  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  total_tokens      INTEGER DEFAULT 0,
  response_time_ms  INTEGER DEFAULT 0,

  has_image         BOOLEAN DEFAULT false,
  has_documents     BOOLEAN DEFAULT false,
  has_codebase_ref  BOOLEAN DEFAULT false,
  attachment_count  INTEGER DEFAULT 0,

  artifact_created  BOOLEAN DEFAULT false,
  artifact_id       UUID,
  diagram_created   BOOLEAN DEFAULT false,
  has_web_search    BOOLEAN DEFAULT false,

  confidence_level  TEXT,
  feedback          TEXT CHECK (feedback IN ('good','bad',NULL)),
  was_regenerated   BOOLEAN DEFAULT false,
  was_edited        BOOLEAN DEFAULT false,

  had_error         BOOLEAN DEFAULT false,
  error_type        TEXT,

  approved_for_training BOOLEAN DEFAULT false,

  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.user_query_log.prompt_text IS
'Capped at 500 chars. Full prompt in messages.content (join on message_id).';
COMMENT ON COLUMN public.user_query_log.approved_for_training IS
'Set true to include this query in admin_training_data view for fine-tuning export.';

-- Daily metrics — aggregated by triggers, fast reads
-- FIX: column name is diagrams_created (not diagram_created)
CREATE TABLE IF NOT EXISTS public.user_daily_metrics (
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date              DATE NOT NULL,
  messages_sent     INTEGER DEFAULT 0,
  queries_made      INTEGER DEFAULT 0,
  sessions_count    INTEGER DEFAULT 0,
  active_minutes    INTEGER DEFAULT 0,
  input_tokens      BIGINT  DEFAULT 0,
  output_tokens     BIGINT  DEFAULT 0,
  total_tokens      BIGINT  DEFAULT 0,
  gemini_queries    INTEGER DEFAULT 0,
  claude_queries    INTEGER DEFAULT 0,
  openai_queries    INTEGER DEFAULT 0,
  coding_queries    INTEGER DEFAULT 0,
  reasoning_queries INTEGER DEFAULT 0,
  live_queries      INTEGER DEFAULT 0,
  general_queries   INTEGER DEFAULT 0,
  artifacts_created INTEGER DEFAULT 0,
  diagrams_created  INTEGER DEFAULT 0,  -- FIX: was diagram_created in bug version
  files_uploaded    INTEGER DEFAULT 0,
  good_feedback     INTEGER DEFAULT 0,
  bad_feedback      INTEGER DEFAULT 0,
  regenerations     INTEGER DEFAULT 0,
  errors            INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Platform daily totals
CREATE TABLE IF NOT EXISTS public.platform_daily (
  date              DATE PRIMARY KEY,
  new_signups       INTEGER DEFAULT 0,
  active_users      INTEGER DEFAULT 0,
  total_sessions    INTEGER DEFAULT 0,
  total_queries     INTEGER DEFAULT 0,
  total_tokens      BIGINT  DEFAULT 0,
  gemini_queries    INTEGER DEFAULT 0,
  claude_queries    INTEGER DEFAULT 0,
  openai_queries    INTEGER DEFAULT 0,
  artifacts_created INTEGER DEFAULT 0,
  errors            INTEGER DEFAULT 0,
  good_feedback     INTEGER DEFAULT 0,
  bad_feedback      INTEGER DEFAULT 0,
  computed_at       TIMESTAMPTZ DEFAULT now()
);

-- Error log
CREATE TABLE IF NOT EXISTS public.error_log (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  error_type      TEXT NOT NULL,
  error_code      TEXT,
  error_message   TEXT NOT NULL,
  stack_trace     TEXT,
  component       TEXT,
  model           TEXT,
  is_critical     BOOLEAN DEFAULT false,
  is_resolved     BOOLEAN DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  url             TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ════════════════════════════════════════════════════════════════════════════
-- 11. ADMIN TABLES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email     TEXT,
  action          TEXT NOT NULL,
  target_user_id  UUID,
  target_email    TEXT,
  old_value       JSONB,
  new_value       JSONB,
  reason          TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.admin_notes (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  note        TEXT NOT NULL,
  is_pinned   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- FIXED: surrogate PK + partial unique indexes (replaces illegal COALESCE in PRIMARY KEY)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = global flag
  flag_name   TEXT NOT NULL,
  is_enabled  BOOLEAN DEFAULT false,
  notes       TEXT,
  set_by      UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- One global flag per name (user_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_feature_flags_global
  ON public.feature_flags(flag_name) WHERE user_id IS NULL;

-- One per-user flag per name (user_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_feature_flags_user
  ON public.feature_flags(user_id, flag_name) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.feature_flags IS
'Global flags: user_id=NULL, flag_name="enable_voice".
Per-user flags: user_id=<uuid>, flag_name="beta_access".
FIX: uses partial unique indexes instead of COALESCE() in PRIMARY KEY (illegal in Postgres).';

-- ════════════════════════════════════════════════════════════════════════════
-- 12. STORAGE BUCKETS
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sedrex-uploads', 'sedrex-uploads', false, 104857600, ARRAY[
  'image/jpeg','image/jpg','image/png','image/webp','image/gif',
  'image/heic','image/heif','image/tiff','image/bmp','image/svg+xml',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','text/markdown','text/html','text/css',
  'application/json','application/xml',
  'application/zip','application/x-zip-compressed',
  'audio/mpeg','audio/wav','audio/mp4','audio/webm',
  'video/mp4','video/webm','video/quicktime',
  'application/javascript','application/typescript',
  'application/octet-stream'
]) ON CONFLICT (id) DO UPDATE SET
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sedrex-avatars', 'sedrex-avatars', true, 5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/gif'])
ON CONFLICT (id) DO UPDATE SET file_size_limit=EXCLUDED.file_size_limit;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sedrex-artifacts', 'sedrex-artifacts', false, 52428800, ARRAY[
  'text/plain','text/html','text/css','text/markdown','text/csv',
  'application/json','application/javascript','application/zip','application/octet-stream'
]) ON CONFLICT (id) DO UPDATE SET file_size_limit=EXCLUDED.file_size_limit;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sedrex-exports', 'sedrex-exports', false, 52428800,
  ARRAY['application/pdf','text/plain','text/markdown','application/json'])
ON CONFLICT (id) DO UPDATE SET file_size_limit=EXCLUDED.file_size_limit;

-- ════════════════════════════════════════════════════════════════════════════
-- 13. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════

DO $rls$ BEGIN
  EXECUTE 'ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_preferences      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_memory           ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_auth_events      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.token_budgets         ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.model_token_summary   ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_stats            ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.conversations         ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.messages              ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.artifacts             ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.generated_code        ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.generated_diagrams    ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.generated_images      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.file_uploads          ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_sessions         ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_events           ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_query_log        ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_daily_metrics    ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.platform_daily        ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.error_log             ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.admin_audit_log       ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.admin_notes           ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.feature_flags         ENABLE ROW LEVEL SECURITY';
END $rls$;

-- Drop all existing policies before recreating (idempotent)
DO $drop$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $drop$;

DROP POLICY IF EXISTS "user_upload_files"      ON storage.objects;
DROP POLICY IF EXISTS "user_read_files"        ON storage.objects;
DROP POLICY IF EXISTS "user_delete_files"      ON storage.objects;
DROP POLICY IF EXISTS "user_upload_avatars"    ON storage.objects;
DROP POLICY IF EXISTS "public_read_avatars"    ON storage.objects;
DROP POLICY IF EXISTS "user_delete_avatars"    ON storage.objects;
DROP POLICY IF EXISTS "user_upload_artifacts"  ON storage.objects;
DROP POLICY IF EXISTS "user_read_artifacts"    ON storage.objects;
DROP POLICY IF EXISTS "user_delete_artifacts"  ON storage.objects;
DROP POLICY IF EXISTS "user_upload_exports"    ON storage.objects;
DROP POLICY IF EXISTS "user_read_exports"      ON storage.objects;
DROP POLICY IF EXISTS "admin_read_all_storage" ON storage.objects;

-- Storage policies
CREATE POLICY "user_upload_files"      ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='sedrex-uploads'    AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_read_files"        ON storage.objects FOR SELECT TO authenticated USING  (bucket_id='sedrex-uploads'    AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_delete_files"      ON storage.objects FOR DELETE TO authenticated USING  (bucket_id='sedrex-uploads'    AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_upload_avatars"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='sedrex-avatars'   AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "public_read_avatars"    ON storage.objects FOR SELECT TO public         USING  (bucket_id='sedrex-avatars');
CREATE POLICY "user_delete_avatars"    ON storage.objects FOR DELETE TO authenticated USING  (bucket_id='sedrex-avatars'   AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_upload_artifacts"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='sedrex-artifacts' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_read_artifacts"    ON storage.objects FOR SELECT TO authenticated USING  (bucket_id='sedrex-artifacts' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_delete_artifacts"  ON storage.objects FOR DELETE TO authenticated USING  (bucket_id='sedrex-artifacts' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_upload_exports"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='sedrex-exports'   AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "user_read_exports"      ON storage.objects FOR SELECT TO authenticated USING  (bucket_id='sedrex-exports'   AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "admin_read_all_storage" ON storage.objects FOR SELECT TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));

-- User own-data policies
CREATE POLICY "own_profile"          ON public.profiles           FOR ALL  USING (auth.uid()=id);
CREATE POLICY "own_preferences"      ON public.user_preferences   FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_memory"           ON public.user_memory        FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_auth_events"      ON public.user_auth_events   FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "own_token_budget"     ON public.token_budgets      FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "own_token_summary"    ON public.model_token_summary FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_stats"            ON public.user_stats         FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_conversations"    ON public.conversations       FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_messages"         ON public.messages           FOR ALL  USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND c.user_id=auth.uid()));
CREATE POLICY "own_artifacts"        ON public.artifacts          FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_generated_code"   ON public.generated_code     FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_diagrams"         ON public.generated_diagrams FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_images"           ON public.generated_images   FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_files"            ON public.file_uploads       FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_sessions"         ON public.user_sessions      FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_events"           ON public.user_events        FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_query_log"        ON public.user_query_log     FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_daily"            ON public.user_daily_metrics FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "own_errors"           ON public.error_log          FOR ALL  USING (auth.uid()=user_id);
CREATE POLICY "service_platform"     ON public.platform_daily     FOR ALL  TO service_role USING (true);
CREATE POLICY "own_flags"            ON public.feature_flags      FOR SELECT USING (user_id IS NULL OR auth.uid()=user_id);

-- Admin see-everything policies
DO $admin_pol$ BEGIN EXECUTE $p$
  CREATE POLICY "admin_profiles"     ON public.profiles           FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_sessions"     ON public.user_sessions      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_events"       ON public.user_events        FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_query_log"    ON public.user_query_log     FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_messages"     ON public.messages           FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_files"        ON public.file_uploads       FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_artifacts"    ON public.artifacts          FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_gen_code"     ON public.generated_code     FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_gen_diagrams" ON public.generated_diagrams FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_gen_images"   ON public.generated_images   FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_token_budget" ON public.token_budgets      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_token_sum"    ON public.model_token_summary FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_stats"        ON public.user_stats         FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_daily"        ON public.user_daily_metrics FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_platform"     ON public.platform_daily     FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_auth_events"  ON public.user_auth_events   FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_memory"       ON public.user_memory        FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_audit"        ON public.admin_audit_log    FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_notes_pol"    ON public.admin_notes        FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_errors"       ON public.error_log          FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_flags"        ON public.feature_flags      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
  CREATE POLICY "admin_preferences"  ON public.user_preferences   FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
$p$; END $admin_pol$;

-- ════════════════════════════════════════════════════════════════════════════
-- 14. TRIGGERS & FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════

-- Auto updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profiles_ts       ON public.profiles;
DROP TRIGGER IF EXISTS trg_prefs_ts          ON public.user_preferences;
DROP TRIGGER IF EXISTS trg_memory_ts         ON public.user_memory;
DROP TRIGGER IF EXISTS trg_artifacts_ts      ON public.artifacts;
DROP TRIGGER IF EXISTS trg_gen_code_ts       ON public.generated_code;
DROP TRIGGER IF EXISTS trg_admin_notes_ts    ON public.admin_notes;
DROP TRIGGER IF EXISTS trg_token_budget_ts   ON public.token_budgets;

CREATE TRIGGER trg_profiles_ts     BEFORE UPDATE ON public.profiles            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_prefs_ts        BEFORE UPDATE ON public.user_preferences    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_memory_ts       BEFORE UPDATE ON public.user_memory         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_artifacts_ts    BEFORE UPDATE ON public.artifacts           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_gen_code_ts     BEFORE UPDATE ON public.generated_code      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_admin_notes_ts  BEFORE UPDATE ON public.admin_notes         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_token_budget_ts BEFORE UPDATE ON public.token_budgets       FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New user signup: creates all required rows atomically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
DECLARE v_source TEXT := COALESCE(NEW.raw_user_meta_data->>'provider', 'email');
BEGIN
  INSERT INTO public.profiles (id, email, full_name, display_name, tier, signup_source, created_at, updated_at)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Sedrex User'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Sedrex User'),
    'free', v_source, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;

  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_stats (user_id, tier) VALUES (NEW.id, 'free') ON CONFLICT DO NOTHING;
  INSERT INTO public.token_budgets (user_id, total_token_limit, remaining_tokens)
    VALUES (NEW.id, 100000, 100000) ON CONFLICT DO NOTHING;

  INSERT INTO public.user_auth_events (user_id, email, event_type, provider, success)
  VALUES (NEW.id, NEW.email,
    CASE v_source
      WHEN 'google'   THEN 'signup_google'
      WHEN 'github'   THEN 'signup_github'
      WHEN 'facebook' THEN 'signup_facebook'
      ELSE 'signup_email'
    END, v_source, true);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'handle_new_user: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Conversation stats from messages
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations SET
    last_modified           = NOW(),
    message_count           = COALESCE(message_count,0) + 1,
    user_message_count      = COALESCE(user_message_count,0) + CASE WHEN NEW.role='user' THEN 1 ELSE 0 END,
    assistant_message_count = COALESCE(assistant_message_count,0) + CASE WHEN NEW.role='assistant' THEN 1 ELSE 0 END,
    total_tokens            = COALESCE(total_tokens,0) + COALESCE(NEW.tokens_used,0),
    total_input_tokens      = COALESCE(total_input_tokens,0) + COALESCE(NEW.input_tokens,0),
    total_output_tokens     = COALESCE(total_output_tokens,0) + COALESCE(NEW.output_tokens,0),
    has_images    = has_images    OR COALESCE(NEW.has_image,false),
    has_documents = has_documents OR COALESCE(NEW.has_documents,false),
    has_artifacts = has_artifacts OR COALESCE(NEW.has_artifacts,false)
  WHERE id=NEW.conversation_id;
  -- Populate content_length
  UPDATE public.messages SET content_length=LENGTH(NEW.content) WHERE id=NEW.id AND content_length=0;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_conversation_on_message: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_message_updates_conversation ON public.messages;
CREATE TRIGGER trg_message_updates_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- Token deduction + model summary on each query
CREATE OR REPLACE FUNCTION update_token_budget_on_query()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.token_budgets SET
    remaining_tokens  = CASE WHEN is_unlimited THEN remaining_tokens
                             ELSE GREATEST(0, remaining_tokens - COALESCE(NEW.total_tokens,0)) END,
    tokens_used_today = COALESCE(tokens_used_today,0) + COALESCE(NEW.total_tokens,0),
    tokens_used_month = COALESCE(tokens_used_month,0) + COALESCE(NEW.total_tokens,0),
    tokens_used_total = COALESCE(tokens_used_total,0) + COALESCE(NEW.total_tokens,0),
    updated_at        = NOW()
  WHERE user_id=NEW.user_id;

  INSERT INTO public.model_token_summary (user_id, model, model_provider,
    total_input_tokens, total_output_tokens, total_tokens, query_count, last_used_at)
  VALUES (NEW.user_id, COALESCE(NEW.model_used,'unknown'), COALESCE(NEW.model_provider,'unknown'),
    COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0), COALESCE(NEW.total_tokens,0), 1, NOW())
  ON CONFLICT (user_id, model) DO UPDATE SET
    total_input_tokens  = model_token_summary.total_input_tokens  + COALESCE(NEW.input_tokens,0),
    total_output_tokens = model_token_summary.total_output_tokens + COALESCE(NEW.output_tokens,0),
    total_tokens        = model_token_summary.total_tokens        + COALESCE(NEW.total_tokens,0),
    query_count         = model_token_summary.query_count + 1,
    error_count         = model_token_summary.error_count + CASE WHEN NEW.had_error THEN 1 ELSE 0 END,
    last_used_at        = NOW();

  UPDATE public.profiles SET
    total_tokens_lifetime = COALESCE(total_tokens_lifetime,0) + COALESCE(NEW.total_tokens,0),
    last_message_at       = NEW.created_at
  WHERE id=NEW.user_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_token_budget_on_query: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_query_updates_tokens ON public.user_query_log;
CREATE TRIGGER trg_query_updates_tokens
  AFTER INSERT ON public.user_query_log
  FOR EACH ROW EXECUTE FUNCTION update_token_budget_on_query();

-- Daily metrics aggregation
-- FIX: diagrams_created (not diagram_created), NULL fix in intent check
CREATE OR REPLACE FUNCTION update_daily_metrics_on_query()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
DECLARE v_date DATE := DATE(NEW.created_at);
BEGIN
  INSERT INTO public.user_daily_metrics (user_id, date,
    queries_made, input_tokens, output_tokens, total_tokens,
    gemini_queries, claude_queries, openai_queries,
    coding_queries, reasoning_queries, live_queries, general_queries,
    artifacts_created, diagrams_created,
    good_feedback, bad_feedback, regenerations, errors
  ) VALUES (
    NEW.user_id, v_date, 1,
    COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0), COALESCE(NEW.total_tokens,0),
    CASE WHEN NEW.model_provider='google'    OR NEW.model_used ILIKE '%gemini%' THEN 1 ELSE 0 END,
    CASE WHEN NEW.model_provider='anthropic' OR NEW.model_used ILIKE '%claude%' THEN 1 ELSE 0 END,
    CASE WHEN NEW.model_provider='openai'    OR NEW.model_used ILIKE '%gpt%'    THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='coding'    THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='live'      THEN 1 ELSE 0 END,
    -- FIX: NULL cannot be in IN() list — use explicit IS NULL check
    CASE WHEN NEW.intent='general' OR NEW.intent IS NULL THEN 1 ELSE 0 END,
    CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END,
    CASE WHEN NEW.diagram_created  THEN 1 ELSE 0 END,
    CASE WHEN NEW.feedback='good'  THEN 1 ELSE 0 END,
    CASE WHEN NEW.feedback='bad'   THEN 1 ELSE 0 END,
    CASE WHEN NEW.was_regenerated  THEN 1 ELSE 0 END,
    CASE WHEN NEW.had_error        THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    queries_made      = user_daily_metrics.queries_made      + 1,
    input_tokens      = user_daily_metrics.input_tokens      + COALESCE(NEW.input_tokens,0),
    output_tokens     = user_daily_metrics.output_tokens     + COALESCE(NEW.output_tokens,0),
    total_tokens      = user_daily_metrics.total_tokens      + COALESCE(NEW.total_tokens,0),
    gemini_queries    = user_daily_metrics.gemini_queries    + CASE WHEN NEW.model_provider='google'    OR NEW.model_used ILIKE '%gemini%' THEN 1 ELSE 0 END,
    claude_queries    = user_daily_metrics.claude_queries    + CASE WHEN NEW.model_provider='anthropic' OR NEW.model_used ILIKE '%claude%' THEN 1 ELSE 0 END,
    openai_queries    = user_daily_metrics.openai_queries    + CASE WHEN NEW.model_provider='openai'    OR NEW.model_used ILIKE '%gpt%'    THEN 1 ELSE 0 END,
    coding_queries    = user_daily_metrics.coding_queries    + CASE WHEN NEW.intent='coding'    THEN 1 ELSE 0 END,
    reasoning_queries = user_daily_metrics.reasoning_queries + CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END,
    live_queries      = user_daily_metrics.live_queries      + CASE WHEN NEW.intent='live'      THEN 1 ELSE 0 END,
    general_queries   = user_daily_metrics.general_queries   + CASE WHEN NEW.intent='general' OR NEW.intent IS NULL THEN 1 ELSE 0 END,
    artifacts_created = user_daily_metrics.artifacts_created + CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END,
    diagrams_created  = user_daily_metrics.diagrams_created  + CASE WHEN NEW.diagram_created  THEN 1 ELSE 0 END,
    good_feedback     = user_daily_metrics.good_feedback     + CASE WHEN NEW.feedback='good'  THEN 1 ELSE 0 END,
    bad_feedback      = user_daily_metrics.bad_feedback      + CASE WHEN NEW.feedback='bad'   THEN 1 ELSE 0 END,
    regenerations     = user_daily_metrics.regenerations     + CASE WHEN NEW.was_regenerated  THEN 1 ELSE 0 END,
    errors            = user_daily_metrics.errors            + CASE WHEN NEW.had_error        THEN 1 ELSE 0 END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_daily_metrics_on_query: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_query_daily_metrics ON public.user_query_log;
CREATE TRIGGER trg_query_daily_metrics
  AFTER INSERT ON public.user_query_log
  FOR EACH ROW EXECUTE FUNCTION update_daily_metrics_on_query();

-- User stats update
CREATE OR REPLACE FUNCTION update_user_stats_on_query()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_stats (user_id, tier, total_messages, total_input_tokens,
    total_output_tokens, last_message_at, first_message_at,
    total_artifacts, total_code_requests, total_live_requests, total_reasoning_requests)
  VALUES (NEW.user_id, 'free', 1,
    COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0),
    NEW.created_at, NEW.created_at,
    CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='coding'    THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='live'      THEN 1 ELSE 0 END,
    CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END)
  ON CONFLICT (user_id) DO UPDATE SET
    total_messages           = COALESCE(user_stats.total_messages,0)           + 1,
    monthly_messages         = COALESCE(user_stats.monthly_messages,0)         + 1,
    tokens_estimated         = COALESCE(user_stats.tokens_estimated,0)         + COALESCE(NEW.total_tokens,0),
    total_input_tokens       = COALESCE(user_stats.total_input_tokens,0)       + COALESCE(NEW.input_tokens,0),
    total_output_tokens      = COALESCE(user_stats.total_output_tokens,0)      + COALESCE(NEW.output_tokens,0),
    last_message_at          = NEW.created_at,
    first_message_at         = COALESCE(user_stats.first_message_at, NEW.created_at),
    total_artifacts          = COALESCE(user_stats.total_artifacts,0)          + CASE WHEN NEW.artifact_created THEN 1 ELSE 0 END,
    total_code_requests      = COALESCE(user_stats.total_code_requests,0)      + CASE WHEN NEW.intent='coding'    THEN 1 ELSE 0 END,
    total_live_requests      = COALESCE(user_stats.total_live_requests,0)      + CASE WHEN NEW.intent='live'      THEN 1 ELSE 0 END,
    total_reasoning_requests = COALESCE(user_stats.total_reasoning_requests,0) + CASE WHEN NEW.intent='reasoning' THEN 1 ELSE 0 END,
    total_good_feedback      = COALESCE(user_stats.total_good_feedback,0)      + CASE WHEN NEW.feedback='good'    THEN 1 ELSE 0 END,
    total_bad_feedback       = COALESCE(user_stats.total_bad_feedback,0)       + CASE WHEN NEW.feedback='bad'     THEN 1 ELSE 0 END,
    model_usage = jsonb_set(
      COALESCE(user_stats.model_usage,'{}'::jsonb),
      ARRAY[COALESCE(NEW.model_used,'unknown')],
      to_jsonb(COALESCE((user_stats.model_usage->>COALESCE(NEW.model_used,'unknown'))::int,0)+1)
    );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_user_stats_on_query: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_query_user_stats ON public.user_query_log;
CREATE TRIGGER trg_query_user_stats
  AFTER INSERT ON public.user_query_log
  FOR EACH ROW EXECUTE FUNCTION update_user_stats_on_query();

-- Session end: update profile + compute duration
CREATE OR REPLACE FUNCTION update_profile_on_session_end()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_active=true AND NEW.is_active=false AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - OLD.started_at))::INTEGER;
    UPDATE public.profiles SET
      last_seen_at   = NEW.ended_at,
      total_sessions = COALESCE(total_sessions,0) + 1
    WHERE id=NEW.user_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_profile_on_session_end: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_session_end ON public.user_sessions;
CREATE TRIGGER trg_session_end
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_profile_on_session_end();

-- Artifact count on conversation
CREATE OR REPLACE FUNCTION update_conversation_artifact_count()
RETURNS TRIGGER SECURITY DEFINER SET search_path=public LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    UPDATE public.conversations SET
      artifact_count = COALESCE(artifact_count,0) + 1,
      has_artifacts  = true,
      has_code       = has_code OR (NEW.artifact_type IN ('code','react','html'))
    WHERE id=NEW.session_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'update_conversation_artifact_count: %', SQLERRM; RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_artifact_updates_conv ON public.generated_code;
DROP TRIGGER IF EXISTS trg_diagram_updates_conv  ON public.generated_diagrams;
CREATE TRIGGER trg_artifact_updates_conv AFTER INSERT ON public.generated_code     FOR EACH ROW EXECUTE FUNCTION update_conversation_artifact_count();
CREATE TRIGGER trg_diagram_updates_conv  AFTER INSERT ON public.generated_diagrams FOR EACH ROW EXECUTE FUNCTION update_conversation_artifact_count();

-- ════════════════════════════════════════════════════════════════════════════
-- 15. INDEXES
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_profiles_email       ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_tier        ON public.profiles(tier);
CREATE INDEX IF NOT EXISTS idx_profiles_admin       ON public.profiles(is_admin) WHERE is_admin=true;
CREATE INDEX IF NOT EXISTS idx_profiles_seen        ON public.profiles(last_seen_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conv_user            ON public.conversations(user_id, last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_conv_favorite        ON public.conversations(user_id, is_favorite) WHERE is_favorite=true;
CREATE INDEX IF NOT EXISTS idx_conv_training        ON public.conversations(approved_for_training) WHERE approved_for_training=true;

CREATE INDEX IF NOT EXISTS idx_msg_conv_time        ON public.messages(conversation_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_msg_feedback         ON public.messages(feedback) WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_training         ON public.messages(approved_for_training) WHERE approved_for_training=true;
CREATE INDEX IF NOT EXISTS idx_msg_model            ON public.messages(model);

CREATE INDEX IF NOT EXISTS idx_art_user             ON public.artifacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_art_conv             ON public.artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_gencode_user         ON public.generated_code(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gencode_session      ON public.generated_code(session_id);
CREATE INDEX IF NOT EXISTS idx_gendiag_user         ON public.generated_diagrams(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gendiag_session      ON public.generated_diagrams(session_id);
CREATE INDEX IF NOT EXISTS idx_genimg_user          ON public.generated_images(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_genimg_session       ON public.generated_images(session_id);

CREATE INDEX IF NOT EXISTS idx_files_user           ON public.file_uploads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_type           ON public.file_uploads(file_type);
CREATE INDEX IF NOT EXISTS idx_files_conv           ON public.file_uploads(conversation_id);

CREATE INDEX IF NOT EXISTS idx_sessions_active      ON public.user_sessions(user_id, is_active) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON public.user_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_user          ON public.user_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_category      ON public.user_events(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session       ON public.user_events(session_id);

CREATE INDEX IF NOT EXISTS idx_qlog_user            ON public.user_query_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qlog_model           ON public.user_query_log(model_used);
CREATE INDEX IF NOT EXISTS idx_qlog_intent          ON public.user_query_log(intent);
CREATE INDEX IF NOT EXISTS idx_qlog_training        ON public.user_query_log(approved_for_training) WHERE approved_for_training=true;
CREATE INDEX IF NOT EXISTS idx_qlog_error           ON public.user_query_log(had_error) WHERE had_error=true;
CREATE INDEX IF NOT EXISTS idx_qlog_date            ON public.user_query_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_user_date      ON public.user_daily_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_date           ON public.user_daily_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_low           ON public.token_budgets(remaining_tokens) WHERE remaining_tokens < 10000;
CREATE INDEX IF NOT EXISTS idx_memory_user          ON public.user_memory(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memory_training      ON public.user_memory(approved_for_training) WHERE approved_for_training=true;
CREATE INDEX IF NOT EXISTS idx_errors_critical      ON public.error_log(is_critical) WHERE is_critical=true;
CREATE INDEX IF NOT EXISTS idx_errors_unresolved    ON public.error_log(is_resolved) WHERE is_resolved=false;
CREATE INDEX IF NOT EXISTS idx_auth_events_user     ON public.user_auth_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_type     ON public.user_auth_events(event_type);

-- ════════════════════════════════════════════════════════════════════════════
-- 16. ADMIN VIEWS
-- ════════════════════════════════════════════════════════════════════════════

-- Master admin view: every user, all stats, token budget, live status
CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
  p.id AS user_id, u.email,
  p.full_name, p.display_name, p.avatar_url,
  p.tier, p.is_admin, p.is_banned, p.ban_reason,
  p.country, p.city, p.timezone, p.device_type, p.browser, p.os,
  p.signup_source, p.referrer,
  u.created_at AS signup_at, u.email_confirmed_at AS email_verified_at,
  p.last_seen_at, p.last_login_at, p.last_message_at,
  p.total_sessions, p.total_logins, p.total_tokens_lifetime,
  p.personification, p.preferred_model, p.admin_notes,

  -- Token budget (edit these in Table Editor)
  tb.total_token_limit, tb.remaining_tokens, tb.is_unlimited,
  tb.tokens_used_today, tb.tokens_used_month, tb.tokens_used_total,

  -- Usage stats
  COALESCE(us.total_messages,0)           AS total_messages,
  COALESCE(us.monthly_messages,0)         AS monthly_messages,
  COALESCE(us.total_conversations,0)      AS total_conversations,
  COALESCE(us.total_artifacts,0)          AS total_artifacts,
  COALESCE(us.total_input_tokens,0)       AS total_input_tokens,
  COALESCE(us.total_output_tokens,0)      AS total_output_tokens,
  COALESCE(us.total_code_requests,0)      AS total_code_requests,
  COALESCE(us.total_live_requests,0)      AS total_live_requests,
  COALESCE(us.total_reasoning_requests,0) AS total_reasoning_requests,
  COALESCE(us.total_good_feedback,0)      AS total_good_feedback,
  COALESCE(us.total_bad_feedback,0)       AS total_bad_feedback,
  us.favorite_model, us.first_message_at,

  -- Today from aggregated table (no query_log scan)
  COALESCE(dm.queries_made,0)     AS queries_today,
  COALESCE(dm.total_tokens,0)     AS tokens_today,
  COALESCE(dm.artifacts_created,0) AS artifacts_today,

  -- Per-model breakdown
  mts.model_breakdown,

  -- Live status
  EXISTS (SELECT 1 FROM public.user_sessions s WHERE s.user_id=p.id AND s.is_active=true) AS is_online,

  -- File count
  (SELECT COUNT(*) FROM public.file_uploads f WHERE f.user_id=p.id AND NOT f.is_deleted) AS total_files,

  -- Memory count
  (SELECT COUNT(*) FROM public.user_memory m WHERE m.user_id=p.id AND m.is_active=true) AS memory_count

FROM public.profiles p
JOIN auth.users u ON u.id=p.id
LEFT JOIN public.user_stats us ON us.user_id=p.id
LEFT JOIN public.token_budgets tb ON tb.user_id=p.id
LEFT JOIN public.user_daily_metrics dm ON dm.user_id=p.id AND dm.date=CURRENT_DATE
LEFT JOIN (
  SELECT user_id,
    jsonb_object_agg(model, total_tokens ORDER BY total_tokens DESC) AS model_breakdown
  FROM public.model_token_summary
  GROUP BY user_id
) mts ON mts.user_id=p.id
ORDER BY p.last_seen_at DESC NULLS LAST;

COMMENT ON VIEW public.admin_user_overview IS
'Complete user view for admin dashboard. model_breakdown shows per-model token totals.
Edit token_budgets table directly to change user limits.';

-- Platform daily stats
CREATE OR REPLACE VIEW public.admin_platform_daily AS
SELECT
  dm.date,
  COUNT(DISTINCT dm.user_id)         AS active_users,
  SUM(dm.queries_made)               AS total_queries,
  SUM(dm.total_tokens)               AS total_tokens,
  SUM(dm.sessions_count)             AS sessions,
  SUM(dm.gemini_queries)             AS gemini,
  SUM(dm.claude_queries)             AS claude,
  SUM(dm.openai_queries)             AS openai,
  SUM(dm.coding_queries)             AS coding,
  SUM(dm.reasoning_queries)          AS reasoning,
  SUM(dm.live_queries)               AS live,
  SUM(dm.general_queries)            AS general,
  SUM(dm.artifacts_created)          AS artifacts,
  SUM(dm.diagrams_created)           AS diagrams,
  SUM(dm.good_feedback)              AS good_feedback,
  SUM(dm.bad_feedback)               AS bad_feedback,
  SUM(dm.errors)                     AS errors,
  COALESCE(pd.new_signups,0)         AS new_signups,
  ROUND(AVG(dm.queries_made)::NUMERIC,2) AS avg_per_user
FROM public.user_daily_metrics dm
LEFT JOIN public.platform_daily pd ON pd.date=dm.date
GROUP BY dm.date, pd.new_signups
ORDER BY dm.date DESC;

-- Training data export
CREATE OR REPLACE VIEW public.admin_training_data AS
SELECT 'query'::TEXT AS data_type,
  ql.id::TEXT, ql.user_id,
  ql.prompt_text AS input, m.content AS output,
  ql.intent, ql.model_used, ql.feedback, ql.created_at
FROM public.user_query_log ql
LEFT JOIN public.messages m ON m.id=ql.message_id AND m.role='assistant'
WHERE ql.approved_for_training=true AND (m.approved_for_training=true OR m.id IS NULL)
UNION ALL
SELECT 'memory'::TEXT, um.id::TEXT, um.user_id,
  um.memory_type, um.content, NULL, NULL, NULL, um.created_at
FROM public.user_memory um
WHERE um.approved_for_training=true
ORDER BY created_at DESC;

COMMENT ON VIEW public.admin_training_data IS
'All approved training rows. Export as CSV: Supabase → Table Editor → admin_training_data → Export.';

-- ════════════════════════════════════════════════════════════════════════════
-- 17. GRANTS
-- ════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 18. ADMIN SETUP (run immediately after COMMIT)
-- ════════════════════════════════════════════════════════════════════════════

-- Sync any auth users without profiles (handles existing users after schema drop)
INSERT INTO public.profiles (id, email, tier, is_admin)
SELECT u.id, u.email, 'free', false
FROM auth.users u
LEFT JOIN public.profiles p ON p.id=u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email;

INSERT INTO public.user_stats (user_id, tier)
SELECT p.id, p.tier FROM public.profiles p
LEFT JOIN public.user_stats s ON s.user_id=p.id
WHERE s.user_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.token_budgets (user_id, total_token_limit, remaining_tokens)
SELECT p.id, 100000, 100000 FROM public.profiles p
LEFT JOIN public.token_budgets t ON t.user_id=p.id
WHERE t.user_id IS NULL
ON CONFLICT DO NOTHING;

-- YOUR admin accounts (both emails covered)
UPDATE public.profiles
SET is_admin=true, tier='admin'
WHERE email IN ('siddheshrandhir007@gmail.com', 'unicorntales2@gmail.com');

UPDATE public.token_budgets SET
  total_token_limit=999999999, remaining_tokens=999999999,
  is_unlimited=true, enforce_limit=false
WHERE user_id IN (
  SELECT id FROM public.profiles
  WHERE email IN ('siddheshrandhir007@gmail.com','unicorntales2@gmail.com')
);

UPDATE public.user_stats SET tier='admin'
WHERE user_id IN (
  SELECT id FROM public.profiles
  WHERE email IN ('siddheshrandhir007@gmail.com','unicorntales2@gmail.com')
);

-- Final verification
SELECT check_type, count FROM (
  SELECT 'Tables'   AS check_type, COUNT(*)::TEXT AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
  UNION ALL
  SELECT 'Views',    COUNT(*)::TEXT FROM information_schema.views WHERE table_schema='public'
  UNION ALL
  SELECT 'Triggers', COUNT(*)::TEXT FROM information_schema.triggers WHERE trigger_schema='public'
  UNION ALL
  SELECT 'Indexes',  COUNT(*)::TEXT FROM pg_indexes WHERE schemaname='public'
  UNION ALL
  SELECT 'Buckets',  COUNT(*)::TEXT FROM storage.buckets WHERE id LIKE 'sedrex-%'
) v;