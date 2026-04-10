export async function forwardToWP(request, env) {
  try {
    // 將原始請求完整轉發至 WordPress Webhook
    const response = await fetch(env.WP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 必須攜帶 LINE 的簽名以供 WordPress 驗證
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
