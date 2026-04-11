export async function forwardToWP(request, env) {
  try {
    const response = await fetch(env.WP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': request.headers.get('x-line-signature') || ''
      },
      body: await request.text()
    });

    if (!response.ok) {
      console.error(`WordPress proxy failed: ${response.status}`);
    }
  } catch (error) {
    console.error('WordPress proxy error:', error);
  }
}
