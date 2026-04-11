export async function forwardToWP(bodyText, headers, env) {
  try {
    await fetch(env.WP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': headers.get('x-line-signature') || ''
      },
      body: bodyText
    });
  } catch (error) {}
}
