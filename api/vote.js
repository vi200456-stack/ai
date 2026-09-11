// Vercel Serverless Function — 돈까스 제품명 투표
// 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (둘 다 필수)
//           ADMIN_KEY (선택) — 설정하면 ?key=<ADMIN_KEY> 로 요청 시 투표자 이름까지 반환(관리자 전용)
//
//  GET  /api/vote            → 현재 집계(순위) 반환. 이름은 미포함(일반 사용자)
//  GET  /api/vote?key=...    → key 가 ADMIN_KEY 와 일치하면 투표자 이름 목록도 포함
//  POST /api/vote            → 투표 저장. body: { voterName, choice }
//                              같은 이름이 이미 투표했으면 409 반환(변경 불가)

// 후보 개수 (index.html 의 OPTIONS 와 반드시 일치해야 함)
const OPTION_COUNT = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({
      error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정 → Environment Variables 에서 추가하고 다시 배포하세요.',
    });
  }

  try {
    if (req.method === 'GET') {
      // 관리자 키가 일치할 때만 투표자 이름을 포함
      const adminKey = process.env.ADMIN_KEY;
      const providedKey = getQueryParam(req, 'key');
      const isAdmin = !!adminKey && providedKey === adminKey;

      const tally = await getTally(url, key, isAdmin);
      return res.status(200).json({ ...tally, admin: isAdmin });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const voterName = (body?.voterName || '').trim();
      const choice = Math.round(Number(body?.choice));

      if (!voterName) {
        return res.status(400).json({ error: '이름을 입력해주세요.' });
      }
      if (voterName.length > 40) {
        return res.status(400).json({ error: '이름은 40자 이하로 입력해주세요.' });
      }
      if (!(choice >= 1 && choice <= OPTION_COUNT)) {
        return res.status(400).json({ error: '올바른 후보를 선택해주세요.' });
      }

      const insertRes = await fetch(`${url}/rest/v1/cutlet_votes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ voter_name: voterName, choice }),
      });

      if (insertRes.status === 409) {
        // unique 제약 위반 = 같은 이름으로 이미 투표함
        return res.status(409).json({
          error: '이미 투표한 이름입니다. 투표는 한 번만 가능하며 변경할 수 없습니다.',
        });
      }
      if (!insertRes.ok) {
        const detail = await insertRes.text();
        const diag = diagnose(insertRes.status, detail);
        return res.status(502).json({ error: diag, detail: detail.slice(0, 300) });
      }

      // 저장 성공 → 최신 집계 함께 반환 (확인 후 바로 실시간 결과 표시)
      const tally = await getTally(url, key);
      return res.status(200).json({ ok: true, ...tally });
    }

    return res.status(405).json({ error: 'GET 또는 POST 요청만 허용됩니다.' });
  } catch (err) {
    // getTally 등에서 던진 진단 메시지를 그대로 전달
    return res.status(502).json({
      error: err.message || '서버 오류가 발생했습니다.',
    });
  }
}

// 전체 투표를 읽어 후보별 카운트로 집계.
// includeVoters=true(관리자)일 때만 투표자 이름 목록을 함께 반환한다.
async function getTally(url, key, includeVoters) {
  const res = await fetch(
    `${url}/rest/v1/cutlet_votes?select=choice,voter_name,created_at&order=created_at.desc`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(diagnose(res.status, detail));
  }

  const rows = await res.json();
  const counts = Array(OPTION_COUNT).fill(0);
  for (const r of rows) {
    const c = Number(r.choice);
    if (c >= 1 && c <= OPTION_COUNT) counts[c - 1]++;
  }

  const result = { counts, total: rows.length };

  // 이름은 관리자에게만 노출 (일반 사용자 응답에는 포함하지 않음)
  if (includeVoters) {
    result.voters = rows.map(r => ({
      name: r.voter_name,
      choice: Number(r.choice),
    }));
  }

  return result;
}

// 쿼리스트링에서 값 하나를 안전하게 추출 (req.query 우선, 없으면 URL 파싱)
function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] !== 'undefined') {
    const v = req.query[name];
    return Array.isArray(v) ? v[0] : v;
  }
  try {
    const u = new URL(req.url, 'http://localhost');
    return u.searchParams.get(name) || '';
  } catch {
    return '';
  }
}

// Supabase(PostgREST) 응답을 사람이 읽을 수 있는 원인 메시지로 변환
function diagnose(status, detail) {
  const d = (detail || '').toLowerCase();

  // 테이블 없음: 스키마 미실행
  if (
    d.includes('does not exist') ||
    d.includes('could not find the table') ||
    d.includes('schema cache') ||
    d.includes('pgrst205') ||
    d.includes('42p01')
  ) {
    return "'cutlet_votes' 테이블이 없습니다. Supabase 대시보드 → SQL Editor 에서 supabase/schema.sql 을 실행해 테이블을 먼저 만드세요.";
  }

  // 인증 실패: URL 또는 서비스 키가 잘못됨
  if (status === 401 || status === 403 || d.includes('jwt') || d.includes('api key') || d.includes('invalid')) {
    return 'Supabase 인증에 실패했습니다. SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY(service_role 키) 값이 올바른지 확인하세요.';
  }

  return `Supabase 요청 실패 (${status}). 잠시 후 다시 시도하거나 설정을 확인하세요.`;
}
