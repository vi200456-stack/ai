-- 사주 추천 결과 저장 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요.

create table if not exists public.saju_records (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  birth_date   date,
  birth_time   text,          -- "HH:MM" 또는 NULL(시간 모름)
  time_unknown boolean not null default false,
  gender       text,          -- 'male' | 'female'
  calendar     text,          -- 'solar' | 'lunar'
  saju         text,          -- 사주 분석 본문
  summary      text,          -- 한 줄 요약
  numbers      int[],         -- 본번호 6개
  bonus        int,           -- 보너스 번호
  reason       text           -- 번호 추천 이유
);

-- RLS 활성화: 익명(anon) 키로는 이 테이블을 읽거나 쓸 수 없게 막습니다.
-- 서버(서버리스 함수)에서 쓰는 service_role 키는 RLS를 우회하므로 저장은 정상 동작합니다.
alter table public.saju_records enable row level security;
