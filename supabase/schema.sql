-- UX Reference Studio — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 파일 전체를 실행하세요.
-- 데스크톱 앱은 anon key 로 접근하므로, 아래 정책은 anon 역할에 읽기/쓰기를 허용합니다.
-- (개인용 도구를 가정한 설정입니다. 여러 사용자가 쓴다면 auth 기반 정책으로 바꾸세요.)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- references: 분석된 레퍼런스 한 건
-- ---------------------------------------------------------------------------
create table if not exists public."references" (
  id                uuid primary key default gen_random_uuid(),
  url               text not null,
  title             text not null default '',
  site_type         text not null default '',
  summary           text not null default '',
  tags              text[] not null default '{}',
  analysis          jsonb not null default '{}'::jsonb,   -- electron/analyzer.js ANALYSIS_SCHEMA 결과
  landmarks         jsonb not null default '{}'::jsonb,   -- electron/capture.js 랜드마크 추출 결과
  screenshot_path   text,                                  -- storage 버킷 내 경로 (예: <id>.png)
  screenshot_url    text,                                  -- public URL
  screenshot_width  integer,
  screenshot_height integer,
  model             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists references_created_at_idx on public."references" (created_at desc);
create index if not exists references_tags_idx on public."references" using gin (tags);

-- ---------------------------------------------------------------------------
-- notes: 레퍼런스의 섹션별 코멘트
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  reference_id  uuid not null references public."references"(id) on delete cascade,
  section_id    text not null default '__general__',      -- analysis.information_architecture.hierarchy[].id 또는 '__general__'
  section_label text not null default '',
  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists notes_reference_id_idx on public.notes (reference_id, created_at);

-- ---------------------------------------------------------------------------
-- studies: 레퍼런스별 학습 기록 (직접 그린 와이어프레임, 내 IA, 문제 정의, AI 비교 글)
-- data 구조는 src/lib/study.js 의 normalizeStudy() 참고
-- ---------------------------------------------------------------------------
create table if not exists public.studies (
  reference_id  uuid primary key references public."references"(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- flows: 여러 페이지(레퍼런스)를 노드로 잇는 화면 흐름. data 구조는 src/lib/flow.js 의 normalizeFlow() 참고
-- ---------------------------------------------------------------------------
create table if not exists public.flows (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists references_set_updated_at on public."references";
create trigger references_set_updated_at before update on public."references"
  for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

drop trigger if exists studies_set_updated_at on public.studies;
create trigger studies_set_updated_at before update on public.studies
  for each row execute function public.set_updated_at();

drop trigger if exists flows_set_updated_at on public.flows;
create trigger flows_set_updated_at before update on public.flows
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: anon 역할 허용 (개인용)
-- ---------------------------------------------------------------------------
alter table public."references" enable row level security;
alter table public.notes enable row level security;
alter table public.studies enable row level security;
alter table public.flows enable row level security;

drop policy if exists "references anon all" on public."references";
create policy "references anon all" on public."references"
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "notes anon all" on public.notes;
create policy "notes anon all" on public.notes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "studies anon all" on public.studies;
create policy "studies anon all" on public.studies
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "flows anon all" on public.flows;
create policy "flows anon all" on public.flows
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage: screenshots 버킷 (public)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', true, 52428800, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = excluded.public;

drop policy if exists "screenshots anon read" on storage.objects;
create policy "screenshots anon read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'screenshots');

drop policy if exists "screenshots anon insert" on storage.objects;
create policy "screenshots anon insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'screenshots');

drop policy if exists "screenshots anon update" on storage.objects;
create policy "screenshots anon update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'screenshots') with check (bucket_id = 'screenshots');

drop policy if exists "screenshots anon delete" on storage.objects;
create policy "screenshots anon delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'screenshots');
