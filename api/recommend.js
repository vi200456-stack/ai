// Vercel Serverless Function — 사주 분석 + 로또 번호 추천
// 환경변수: OPENAI_API_KEY (필수), OPENAI_MODEL (선택, 기본값 gpt-4o-mini)

export default async function handler(req, res) {
  // CORS (같은 도메인 배포라면 없어도 되지만 안전하게)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가하세요.'
    });
  }

  // 모델 이름은 환경변수로 교체 가능. API 키가 접근 가능한 실제 모델 ID여야 합니다.
  const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { birthDate, birthTime, timeUnknown, gender, calendar } = body || {};

    if (!birthDate) {
      return res.status(400).json({ error: '생년월일을 입력해주세요.' });
    }

    const timeText = timeUnknown ? '시간 모름' : (birthTime || '시간 미입력');
    const genderText = gender === 'female' ? '여성' : gender === 'male' ? '남성' : '미입력';
    const calendarText = calendar === 'lunar' ? '음력' : '양력';

    const systemPrompt = `당신은 사주명리학(四柱命理學) 전문가입니다.
사용자의 생년월일과 태어난 시간을 바탕으로 사주 팔자를 간략히 분석하고,
그 기운(오행, 일간, 부족하거나 강한 기운)에 어울리는 로또 번호(1~45)를 추천합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "saju": "사주 분석 (오행 균형, 일간, 올해의 기운 등을 3~4문장으로 친근하게)",
  "summary": "핵심 기운 한 줄 요약",
  "numbers": [서로 다른 6개의 정수, 각각 1~45, 오름차순],
  "bonus": numbers에 없는 1~45 정수 1개,
  "reason": "이 번호들을 추천한 명리학적 이유 (오행·숫자 상징과 연결해 2~3문장)"
}

주의:
- numbers는 반드시 6개, 서로 중복 없이, 1~45 범위, 오름차순.
- bonus는 numbers와 겹치지 않는 1개.
- 사주 분석은 재미와 위안을 주는 따뜻한 톤으로. 단정적 예언은 피하고 "기운" 위주로.`;

    const userPrompt = `생년월일: ${birthDate} (${calendarText})
태어난 시간: ${timeText}
성별: ${genderText}

이 사람의 사주를 분석하고 어울리는 로또 번호를 추천해주세요.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return res.status(502).json({
        error: `OpenAI API 오류 (${openaiRes.status}). 모델 이름(${model})이 올바른지, 키에 접근 권한이 있는지 확인하세요.`,
        detail: errText.slice(0, 500),
      });
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: 'AI 응답을 해석하지 못했습니다. 다시 시도해주세요.' });
    }

    // 번호 검증 & 보정 (1~45, 중복 제거, 6개 보장)
    const clean = sanitizeNumbers(parsed.numbers, parsed.bonus);

    return res.status(200).json({
      saju: parsed.saju || '',
      summary: parsed.summary || '',
      numbers: clean.numbers,
      bonus: clean.bonus,
      reason: parsed.reason || '',
    });
  } catch (err) {
    return res.status(500).json({ error: '서버 오류: ' + (err.message || String(err)) });
  }
}

// 번호 유효성 보정: 6개 유니크(1~45) + 보너스 1개(겹치지 않음)
function sanitizeNumbers(rawNumbers, rawBonus) {
  const set = new Set();
  if (Array.isArray(rawNumbers)) {
    for (const n of rawNumbers) {
      const v = Math.round(Number(n));
      if (v >= 1 && v <= 45) set.add(v);
    }
  }
  // 6개 미만이면 무작위로 채움
  while (set.size < 6) {
    set.add(Math.floor(Math.random() * 45) + 1);
  }
  const numbers = Array.from(set).slice(0, 6).sort((a, b) => a - b);

  let bonus = Math.round(Number(rawBonus));
  if (!(bonus >= 1 && bonus <= 45) || numbers.includes(bonus)) {
    do {
      bonus = Math.floor(Math.random() * 45) + 1;
    } while (numbers.includes(bonus));
  }
  return { numbers, bonus };
}
