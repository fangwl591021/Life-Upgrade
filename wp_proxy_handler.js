export async function forwardToWP(request, env) {
  try { await fetch(env.WP_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-line-signature': request.headers.get('x-line-signature') || '' }, body: await request.text() }); } catch (error) {}
}
