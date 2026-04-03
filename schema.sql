-- =============================================
-- PromptCraft - Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- =============================================

-- Profiles table (auto-created when user signs up)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  plan text default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'inactive',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Usage tracking per user per month
create table if not exists public.usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  month text not null,
  count integer default 0,
  created_at timestamptz default now(),
  unique(user_id, month)
);

-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.usage enable row level security;

-- Policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can view own usage"
  on public.usage for select
  using (auth.uid() = user_id);

-- Auto-create profile when user signs up via Google OAuth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to increment usage count (called from backend)
create or replace function increment_usage(p_user_id uuid, p_month text)
returns void as $$
begin
  insert into public.usage (user_id, month, count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month)
  do update set count = usage.count + 1;
end;
$$ language plpgsql security definer;
