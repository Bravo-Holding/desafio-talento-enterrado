create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  sck text,
  fbp text,
  fbc text,
  page_path text,
  event_id text,
  user_agent text,
  ip text,
  product text not null default 'desafio-21-dias'
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (email);

-- RLS ligado e SEM policy pública: ninguém via anon/authenticated lê ou escreve.
-- Só a Edge Function (service_role, que bypassa RLS) grava.
alter table public.leads enable row level security;
