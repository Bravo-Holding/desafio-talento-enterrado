import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS: libera o domínio da landing (e localhost pra teste).
const ALLOWED_ORIGINS = [
  'https://ebravoholding.com',
  'https://www.ebravoholding.com',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}

// SHA-256 hex (mesma normalização do front pro hash casar com o Pixel).
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ---- normalização (igual ao front) ----
  const email = String(body.email || '').trim().toLowerCase();
  const phone = onlyDigits(String(body.phone || '')); // já chega com 55 na frente
  const fullName = String(body.full_name || '').trim();
  const firstName = String(body.first_name || (fullName.split(/\s+/)[0] || '')).trim().toLowerCase();
  const lastName = String(body.last_name || (fullName.split(/\s+/).slice(1).join(' ') || '')).trim().toLowerCase();

  // validação mínima server-side
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || phone.length < 12) {
    return new Response(JSON.stringify({ error: 'invalid lead data' }), {
      status: 422, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const eventId = String(body.event_id || crypto.randomUUID());
  const fbp = body.fbp ? String(body.fbp) : null;
  const fbc = body.fbc ? String(body.fbc) : null;
  const pagePath = body.page_path ? String(body.page_path) : null;
  const userAgent = req.headers.get('user-agent') || String(body.user_agent || '');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('cf-connecting-ip') || '';
  const eventSourceUrl = String(body.event_source_url || '');

  // Consentimento: três estados. Ausente vira null ("não foi perguntado"), não false.
  // NÃO rejeitamos lead sem consentimento aqui de propósito: o bloqueio já existe no
  // front, e o braço v4 do teste A/B não tem o checkbox. Validar no servidor derrubaria
  // 100% dos leads do controle no instante em que esta versão subisse.
  const consent = typeof body.consent === 'boolean' ? body.consent : null;
  const consentText = body.consent_text ? String(body.consent_text) : null;

  // ---- 1. grava o lead (service_role bypassa RLS) ----
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { error: dbError } = await supabase.from('leads').insert({
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content: body.utm_content ?? null,
    utm_term: body.utm_term ?? null,
    sck: body.sck ?? null,
    fbp,
    fbc,
    page_path: pagePath,
    event_id: eventId,
    user_agent: userAgent,
    ip,
    consent,
    consent_text: consentText,
    consent_at: consent === true ? new Date().toISOString() : null,
  });
  if (dbError) console.error('db insert error:', dbError.message);

  // ---- 2. Meta CAPI (Lead) ----
  const PIXEL_ID = Deno.env.get('META_PIXEL_ID');
  const TOKEN = Deno.env.get('META_CAPI_TOKEN');
  let capi: unknown = { skipped: true };
  if (PIXEL_ID && TOKEN) {
    const user_data: Record<string, unknown> = {
      em: [await sha256(email)],
      ph: [await sha256(phone)],
      fn: firstName ? [await sha256(firstName)] : undefined,
      ln: lastName ? [await sha256(lastName)] : undefined,
      external_id: [await sha256(email)],
      client_user_agent: userAgent || undefined,
    };
    if (ip) user_data.client_ip_address = ip;
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;

    const payload: Record<string, unknown> = {
      data: [{
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: eventSourceUrl || undefined,
        user_data,
        custom_data: { value: 67.0, currency: 'BRL' },
      }],
    };
    const TEST_CODE = Deno.env.get('META_TEST_EVENT_CODE');
    if (TEST_CODE) (payload as Record<string, unknown>).test_event_code = TEST_CODE;

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${TOKEN}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      capi = await res.json();
      if (!res.ok) console.error('CAPI error:', JSON.stringify(capi));
    } catch (e) {
      console.error('CAPI fetch failed:', String(e));
      capi = { error: String(e) };
    }
  }

  return new Response(JSON.stringify({ ok: true, event_id: eventId, capi }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
