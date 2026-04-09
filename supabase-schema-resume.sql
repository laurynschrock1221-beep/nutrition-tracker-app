-- Resume Drafter V1 — Supabase Schema
-- Run in: Dashboard → SQL Editor → New query → paste → Run

-- ── Processed State ──────────────────────────────────────────────────────────
create table if not exists processed_state (
  id text not null,
  user_id uuid references auth.users not null,
  role_key text not null,
  status text not null default 'needs_jd', -- needs_jd | dropped | scored | generated
  reason text,
  source text not null default 'manual',   -- greenhouse | linkedin | builtin | careers | manual | one_off
  company text not null,
  title text not null,
  location text,
  url text,
  jd_text text,
  match boolean,
  match_pct integer,
  cheap_score integer,
  salary_min integer,
  salary_max integer,
  output_file text,
  resume_text text,
  cover_letter_text text,
  integrity_notes text,
  last_seen text not null,
  today boolean not null default false,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_key, user_id)
);

alter table processed_state enable row level security;

create policy "Users see own processed_state"
  on processed_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Manual Roles ──────────────────────────────────────────────────────────────
create table if not exists manual_roles (
  id text primary key,
  user_id uuid references auth.users not null,
  company text not null,
  title text not null,
  location text,
  jd_text text not null,
  status text not null default 'pending', -- pending | processing | generated | failed
  processed_at timestamptz,
  role_key text,
  error_msg text,
  created_at timestamptz not null default now()
);

alter table manual_roles enable row level security;

create policy "Users see own manual_roles"
  on manual_roles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Daily Counts ──────────────────────────────────────────────────────────────
create table if not exists daily_counts (
  id text not null,
  user_id uuid references auth.users not null,
  date text not null,
  generated_count integer not null default 0,
  dropped_count integer not null default 0,
  scored_count integer not null default 0,
  needs_jd_count integer not null default 0,
  primary key (date, user_id)
);

alter table daily_counts enable row level security;

create policy "Users see own daily_counts"
  on daily_counts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Run Digests ───────────────────────────────────────────────────────────────
create table if not exists run_digests (
  id text not null,
  user_id uuid references auth.users not null,
  date text not null,
  digest_text text not null,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (date, user_id)
);

alter table run_digests enable row level security;

create policy "Users see own run_digests"
  on run_digests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── User Settings ─────────────────────────────────────────────────────────────
create table if not exists user_settings (
  id text not null,
  user_id uuid references auth.users not null primary key,
  master_resume text not null default '',
  fact_bank text not null default '',
  daily_cap integer not null default 5,
  match_threshold integer not null default 55,
  target_titles text[] not null default '{}',
  target_locations text[] not null default '{}',
  excluded_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "Users see own user_settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
