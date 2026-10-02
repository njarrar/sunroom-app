// Cloudflare Pages Function: GET/PUT the annotations blob in Workers KV.
// The real access wall is Cloudflare Access on the whole domain (see
// DEPLOY.md). The ALLOWED_EMAIL check below is defense-in-depth on top of
// it: once Access fronts the domain, Cloudflare sets this header itself and
// it cannot be spoofed. Without Access the header IS spoofable — enabling
// Access is not optional.
const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' }

function authorized({ request, env }) {
  const allowed = env.ALLOWED_EMAIL
  if (!allowed) return true
  const email = request.headers.get('cf-access-authenticated-user-email')
  return !!email && email.toLowerCase() === allowed.toLowerCase()
}

export async function onRequestGet(context) {
  if (!authorized(context)) return new Response('{"error":"forbidden"}', { status: 403, headers: JSON_HEADERS })
  const val = await context.env.SUNROOM_KV.get('store')
  return new Response(val ?? 'null', { headers: JSON_HEADERS })
}

async function write(context) {
  if (!authorized(context)) return new Response('{"error":"forbidden"}', { status: 403, headers: JSON_HEADERS })
  const text = await context.request.text()
  if (text.length > 5_000_000) {
    return new Response('{"error":"too large"}', { status: 413, headers: JSON_HEADERS })
  }
  try {
    JSON.parse(text)
  } catch {
    return new Response('{"error":"invalid json"}', { status: 400, headers: JSON_HEADERS })
  }
  await context.env.SUNROOM_KV.put('store', text)
  return new Response('{"ok":true}', { headers: JSON_HEADERS })
}

export const onRequestPut = write
// navigator.sendBeacon (the tab-close flush) can only send POST
export const onRequestPost = write
