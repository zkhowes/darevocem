-- === Tables ===

create table profiles (
  id uuid references auth.users primary key,
  role text default 'user' check (role in ('user', 'admin')),
  display_name text,
  created_at timestamptz default now()
);

create table saved_phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  text text not null,
  category text default 'custom',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table common_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  label text not null,
  value text not null,
  category text default 'general',
  is_dynamic boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  session_id uuid not null,
  event_type text not null,
  screen text not null,
  intent text,
  item_text text,
  item_type text,
  phrase_so_far text,
  final_phrase text,
  time_of_day text,
  day_of_week text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table session_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  session_id uuid not null,
  intent_selected text,
  intent_cycle_count int,
  steps jsonb,
  final_phrase text,
  outcome text,
  time_intent_to_phrase_ms int,
  time_intent_selection_ms int,
  total_selections int,
  total_rejections int,
  total_refinements int,
  total_undos int,
  prediction_hit_rank jsonb,
  time_of_day text,
  day_of_week text,
  metadata jsonb default '{}',
  started_at timestamptz,
  completed_at timestamptz
);

create table preferences (
  user_id uuid references auth.users primary key,
  elevenlabs_voice_id text,
  speech_rate numeric default 1.0,
  text_scale numeric default 1.0,
  gesture_config jsonb default '{}',
  use_system_tts_only boolean default false,
  theme text default 'light',
  show_fallback_buttons boolean default false,
  updated_at timestamptz default now()
);

-- === Enable RLS on all tables ===

alter table profiles enable row level security;
alter table saved_phrases enable row level security;
alter table common_items enable row level security;
alter table usage_events enable row level security;
alter table session_traces enable row level security;
alter table preferences enable row level security;

-- === Helper: check if current user is admin ===

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- === profiles policies ===

create policy "Users see own profile"
  on profiles for select using (auth.uid() = id);

create policy "Admin reads all profiles"
  on profiles for select using (is_admin());

-- === saved_phrases policies ===

create policy "Users manage own saved_phrases"
  on saved_phrases for all using (auth.uid() = user_id);

create policy "Admin manages all saved_phrases"
  on saved_phrases for all using (is_admin());

-- === common_items policies ===

create policy "Users manage own common_items"
  on common_items for all using (auth.uid() = user_id);

create policy "Admin manages all common_items"
  on common_items for all using (is_admin());

-- === usage_events policies ===

create policy "Users insert own usage_events"
  on usage_events for insert with check (auth.uid() = user_id);

create policy "Users read own usage_events"
  on usage_events for select using (auth.uid() = user_id);

create policy "Admin reads all usage_events"
  on usage_events for select using (is_admin());

-- === session_traces policies ===

create policy "Users insert own session_traces"
  on session_traces for insert with check (auth.uid() = user_id);

create policy "Users read own session_traces"
  on session_traces for select using (auth.uid() = user_id);

create policy "Admin reads all session_traces"
  on session_traces for select using (is_admin());

-- === preferences policies ===

create policy "Users manage own preferences"
  on preferences for all using (auth.uid() = user_id);

create policy "Admin reads all preferences"
  on preferences for select using (is_admin());

-- === Indexes for pattern queries ===

create index idx_usage_events_patterns
  on usage_events (user_id, intent, time_of_day, event_type);

create index idx_usage_events_session
  on usage_events (session_id, created_at);

create index idx_session_traces_user
  on session_traces (user_id, completed_at desc);

-- === Auto-create profile on signup ===

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
