// 補強轉發邏輯，確保轉發至 WP 的請求具備完整 Header 與 Body
export async function forwardToWP(bodyText, headers, env) {
  try {
    const signature = headers.get('x-line-signature') || '';
    
    const response = await fetch(env.WP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature,
        'User-Agent': 'Cloudflare-Worker-Proxy'
      },
      body: bodyText,
      redirect: 'follow'
    });

    // 診斷用：記錄轉發狀態 (Worker Console 可見)
    if (!response.ok) {
      console.error(`WP Proxy Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("WP Proxy Error:", error);
  }
}
