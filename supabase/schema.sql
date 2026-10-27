-- 제품명 투표 저장 테이블 (어묵탕: squid_votes, 산적구이: sanjeok_votes)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요.
--
-- 기존에 cutlet_votes 테이블이 있다면 새로 만들지 말고 이름만 바꾸세요:
--   alter table public.cutlet_votes rename to squid_votes;
--   alter index public.cutlet_votes_voter_name_key rename to squid_votes_voter_name_key;

create table if not exists public.squid_votes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  voter_name  text not null,
  choice      int  not null check (choice between 1 and 20)
);

-- 같은 이름으로 중복/재투표 방지 (대소문자 무시 기준)
-- 서버(vote.js)에서 trim 후 저장하므로 정확히 일치하는 이름은 한 번만 투표 가능합니다.
create unique index if not exists squid_votes_voter_name_key
  on public.squid_votes (lower(voter_name));

-- RLS 활성화: 익명(anon) 키로는 이 테이블을 직접 읽거나 쓸 수 없게 막습니다.
-- 서버리스 함수에서 쓰는 service_role 키는 RLS를 우회하므로 저장/집계는 정상 동작합니다.
alter table public.squid_votes enable row level security;

-- 산적구이 제품명 투표 저장 테이블 (구조는 squid_votes 와 동일)
create table if not exists public.sanjeok_votes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  voter_name  text not null,
  choice      int  not null check (choice between 1 and 20)
);
create unique index if not exists sanjeok_votes_voter_name_key
  on public.sanjeok_votes (lower(voter_name));
alter table public.sanjeok_votes enable row level security;

-- 산적구이 재투표 테이블 (1차 공동 1위 2개 후보)
create table if not exists public.sanjeok2_votes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  voter_name  text not null,
  choice      int  not null check (choice between 1 and 20)
);
create unique index if not exists sanjeok2_votes_voter_name_key
  on public.sanjeok2_votes (lower(voter_name));
alter table public.sanjeok2_votes enable row level security;

-- 산적구이 새 후보 7개 투표 테이블 (재투표는 후보 변경으로 중단)
create table if not exists public.sanjeok3_votes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  voter_name  text not null,
  choice      int  not null check (choice between 1 and 20)
);
create unique index if not exists sanjeok3_votes_voter_name_key
  on public.sanjeok3_votes (lower(voter_name));
alter table public.sanjeok3_votes enable row level security;
