import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // GET 路由：處理 LIFF 表單
    if (request.method === 'GET') {
      if (url.searchParams.has('orderId')) return handleLiffPayment(url, env);
      return handleLiffDescription(url, env);
    }

    if (request.method !== 'POST') return new Response('Running', { status: 200 });

    try {
      const clonedRequest = request.clone();
      const body = await request.json();
      if (!body.events || body.events.length === 0) return new Response('OK');

      for (const event of body.events) {
        if (event.type === 'message' && event.message.type === 'text') {
          const text = event.message.text.trim();
          const aiKeywords = ['預約', '課程', '報名', '紀錄', '查', '訂單', '取消報名'];
          if (aiKeywords.some(k => text.includes(k))) {
            ctx.waitUntil(handleAIRequest(event, env));
          } else {
            ctx.waitUntil(forwardToWP(clonedRequest, env));
          }
        } else {
          ctx.waitUntil(forwardToWP(clonedRequest, env));
        }
      }
      return new Response('OK');
    } catch (e) { return new Response('OK'); }
  }
};

/**
 * 匯款回報表單 LIFF (修正欄位抓取與顯示)
 */
async function handleLiffPayment(url, env) {
  const orderId = url.searchParams.get('orderId');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>匯款回報</title>
      <style>
        body { font-family: -apple-system, sans-serif; margin: 0; background: #f4f7f9; color: #333; padding-bottom: 40px; }
        .header { background: #1DB446; color: white; padding: 25px 20px; text-align: center; }
        .container { padding: 15px; max-width: 500px; margin: auto; }
        .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 15px; }
        .label { font-size: 13px; color: #888; margin-bottom: 5px; font-weight: bold; }
        .value { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #000; }
        input { width: 100%; padding: 14px; border: 1px solid #e0e0e0; border-radius: 10px; box-sizing: border-box; font-size: 16px; margin-bottom: 15px; background: #fafafa; }
        .btn { background: #007AFF; color: white; text-align: center; padding: 16px; border-radius: 12px; border: none; width: 100%; font-size: 17px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="font-size: 20px; font-weight: bold;">回報匯款資訊</div>
      </div>
      <div class="container">
        <div id="loading" style="text-align:center; padding: 50px; color:#999;">檢查資料中...</div>
        <form id="payForm" style="display:none;">
          <div class="card">
            <div class="label">訂單單號</div>
            <div class="value" id="d-oid"></div>
            <div class="label">報名課程</div>
            <div class="value" id="d-name"></div>
          </div>
          <div class="card">
            <div class="label">學員姓名</div>
            <input type="text" id="name" required />
            <div class="label">聯絡電話</div>
            <input type="tel" id="phone" required />
            <div class="label">匯款帳號末五碼</div>
            <input type="number" id="last5" pattern="[0-9]*" inputmode="numeric" required />
          </div>
          <button type="submit" class="btn" id="subBtn">確認送出回報</button>
        </form>
      </div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        const oid = "${orderId}";
        const gas = "${env.APPS_SCRIPT_URL}";
        let currentCourse = "";
        let currentAmount = 0;

        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(async () => {
          if (!liff.isLoggedIn()) { liff.login(); return; }
          const userId = liff.getDecodedIDToken().sub;
          const [orderRes, userRes] = await Promise.all([
            fetch(gas + "?action=getUserOrders&lineUid=" + userId).then(r => r.json()),
            fetch(gas + "?action=getUserProfile&lineUid=" + userId).then(r => r.json())
          ]);
          const order = orderRes.data.find(o => o.orderId === oid);
          if (order) {
            currentCourse = order.courseName;
            currentAmount = order.amount;
            document.getElementById('d-oid').innerText = order.orderId;
            document.getElementById('d-name').innerText = order.courseName;
            if (userRes.data) {
              document.getElementById('name').value = userRes.data.name || "";
              document.getElementById('phone').value = userRes.data.phone || "";
            }
            document.getElementById('loading').style.display = 'none';
            document.getElementById('payForm').style.display = 'block';
          }
        });
        document.getElementById('payForm').onsubmit = async (e) => {
          e.preventDefault();
          const btn = document.getElementById('subBtn');
          btn.disabled = true;
          const res = await fetch(gas, { method: 'POST', body: JSON.stringify({
            action: 'reportPayment',
            data: { 
              orderId: oid, 
              name: document.getElementById('name').value, 
              phone: document.getElementById('phone').value, 
              last5: document.getElementById('last5').value,
              courseName: currentCourse,
              amount: currentAmount
            }
          })});
          const result = await res.json();
          if (result.status === 'success') { alert('回報完成！期待與您相見歡。'); liff.closeWindow(); }
        };
      </script>
    </body>
    </html>
  `;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(url, env) { /* 維持原樣 */ }
