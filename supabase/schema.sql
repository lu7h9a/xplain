create table if not exists profiles (
  id uuid primary key,
  email text,
  display_name text,
  preferred_language text,
  preferred_level text,
  preferred_style text,
  interest_hook text,
  current_mood text,
  struggled_topics text[] default '{}',
  slow_question_prompts text[] default '{}',
  wrong_question_prompts text[] default '{}',
  teach_back_highlights text[] default '{}',
  last_topic text,
  last_seen_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists lesson_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  topic text,
  topic_slug text,
  custom_topic text,
  learner_level text,
  mood text,
  preferred_style text,
  language text,
  interest_hook text,
  generation_mode text,
  lesson_payload jsonb,
  lesson_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists learning_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  user_email text,
  learner_name text,
  event_type text,
  topic text,
  topic_slug text,
  generation_mode text,
  lesson_phase text,
  lesson_session_id bigint,
  learner_level text,
  mood text,
  preferred_style text,
  interest_hook text,
  language text,
  slow_questions jsonb default '[]'::jsonb,
  wrong_questions jsonb default '[]'::jsonb,
  missed_concepts jsonb default '[]'::jsonb,
  confusion_area text,
  overlap_score numeric,
  quiz_score integer,
  total_questions integer,
  learner_explanation text,
  feedback_action text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
alter table lesson_sessions enable row level security;
alter table learning_events enable row level security;

create policy if not exists "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy if not exists "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy if not exists "lesson_sessions_select_own" on lesson_sessions for select using (auth.uid() = user_id);
create policy if not exists "learning_events_select_own" on learning_events for select using (auth.uid() = user_id);
