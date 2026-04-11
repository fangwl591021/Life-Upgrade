import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 處理 GET 請求：顯示課程說明頁或匯款回報表單
    if (request.method === 'GET') {
      if (url.pathname === '/payment') {
        return handleLiffPayment(url, env);
      }
      return handleLiffDescription(url, env);
    }

    if (request.method !== 'POST') {
      return new Response('Webhook Hub is running', { status: 200 });
    }

    try {
      const clonedRequest = request.clone();
      const body = await request.json();

      if (!body.events || body.events.length === 0) {
        return new Response('OK', { status: 200 });
      }

      for (const event of body.events) {
        if (event.type === 'message' && event.message.type === 'text') {
          const text = event.message.text.trim();
          
          // 攔截 AI 關鍵字，確保流程不跑去 WordPress
          const aiKeywords = ['預約', '上課', '課程', '階段', '工作坊', '清單', '編號:', '哪些', '報名', '紀錄', '查', '訂單'];
          const isAIIntent = aiKeywords.some(keyword => text.includes(keyword));

          if (isAIIntent) {
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            ctx.waitUntil(handleAIRequest(event, env));
          } else {
            ctx.waitUntil(forwardToWP(clonedRequest, env));
          }
        } else {
          ctx.waitUntil(forwardToWP(clonedRequest, env));
        }
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      return new Response('OK', { status: 200 }); 
    }
  }
};

/**
 * 匯款回報與資料補全表單 (LIFF)
 */
async function handleLiffPayment(url, env) {
  const orderId = url.searchParams.get('orderId');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>匯款回報與資料補全</title>
      <style>
        body { font-family: -apple-system, sans-serif; margin: 0; background: #f4f7f9; color: #333; }
        .header { background: #1DB446; color: white; padding: 20px; text-align: center; }
        .container { padding: 20px; }
        .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }
        .label { font-size: 14px; color: #666; margin-bottom: 8px; font-weight: bold; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 16px; margin-bottom: 15px; }
        .readonly-val { font-weight: bold; margin-bottom: 15px; font-size: 16px; color: #000; }
        .btn { background: #007AFF; color: white; text-align: center; padding: 15px; border-radius: 10px; border: none; width: 100%; font-size: 16px; font-weight: bold; cursor: pointer; }
        .btn:disabled { background: #ccc; }
        .notice { font-size: 12px; color: #999; line-height: 1.5; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="font-size: 20px; font-weight: bold;">匯款回報</div>
        <div style="font-size: 14px; opacity: 0.8; margin-top: 5px;">請填寫資訊以便我們為您核對</div>
      </div>
      <div class="container">
        <div id="loading" style="text-align:center; padding: 40px; color:#999;">正在載入訂單...</div>
        <form id="paymentForm" style="display:none;">
          <div class="card">
            <div class="label">訂單編號</div>
            <div class="readonly-val" id="disp-orderId"></div>
            <div class="label">課程名稱</div>
            <div class="readonly-val" id="disp-courseName"></div>
          </div>
          
          <div class="card">
            <div class="label">學員真實姓名</div>
            <input type="text" id="userName" placeholder="請輸入姓名" required />
            
            <div class="label">聯絡手機</div>
            <input type="tel" id="userPhone" placeholder="請輸入電話" required />

            <div class="label">身分證字號 (保險行政用)</div>
            <input type="text" id="userIdCard" placeholder="請輸入身分證字號" required />
            
            <div class="label">匯款帳號末 5 碼</div>
            <input type="number" id="last5" placeholder="請輸入末五碼" pattern="[0-9]*" inputmode="numeric" required />
          </div>

          <button type="submit" class="btn" id="submitBtn">提交回報資訊</button>
          <div class="notice">提交後，我們將於 1-2 個工作天內核對並更新訂單狀態。</div>
        </form>
      </div>

      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        const orderId = "${orderId}";
        const gasUrl = "${env.APPS_SCRIPT_URL}";

        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => {
          if (!liff.isLoggedIn()) { liff.login(); return; }
          const userId = liff.getContext().userId;
          
          fetch(gasUrl + "?action=getUserOrders&lineUid=" + userId)
            .then(res => res.json())
            .then(res => {
              const order = res.data.find(o => o.orderId === orderId);
              if (order) {
                document.getElementById('disp-orderId').innerText = order.orderId;
                document.getElementById('disp-courseName').innerText = order.courseName;
                document.getElementById('loading').style.display = 'none';
                document.getElementById('paymentForm').style.display = 'block';
              } else {
                document.getElementById('loading').innerText = '找不到訂單資料。';
              }
            });
        });

        document.getElementById('paymentForm').onsubmit = async (e) => {
          e.preventDefault();
          const btn = document.getElementById('submitBtn');
          btn.disabled = true;
          btn.innerText = '提交中...';

          const payload = {
            action: 'reportPayment',
            data: {
              orderId: orderId,
              name: document.getElementById('userName').value,
              phone: document.getElementById('userPhone').value,
              idCard: document.getElementById('userIdCard').value,
              last5: document.getElementById('last5').value
            }
          };

          try {
            const res = await fetch(gasUrl, { method: 'POST', body: JSON.stringify(payload) });
            const result = await res.json();
            if (result.status === 'success') {
              alert('提交成功！期待與您相見歡。');
              liff.closeWindow();
            } else {
              alert('提交失敗：' + result.message);
              btn.disabled = false;
              btn.innerText = '提交回報資訊';
            }
          } catch (err) {
            alert('系統錯誤，請稍後再試。');
            btn.disabled = false;
          }
        };
      </script>
    </body>
    </html>
  `;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(url, env) {
  let courseId = url.searchParams.get('id');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>課程詳細說明</title>
      <style>
        body { font-family: -apple-system, sans-serif; margin: 0; background: #ffffff; color: #333; }
        .container { min-height: 100vh; padding-bottom: 80px; }
        .loading-container { padding: 100px 20px; text-align: center; color: #999; }
        img { width: 100%; height: auto; display: block; background: #eee; min-height: 200px; }
        .content { padding: 20px; }
        h1 { font-size: 24px; margin: 0 0 10px 0; color: #000; }
        .price { color: #FF0000; font-weight: bold; font-size: 22px; margin-bottom: 20px; }
        .desc { line-height: 1.8; font-size: 16px; color: #444; border-top: 1px solid #eee; padding-top: 20px; white-space: pre-wrap; }
        .btn-box { position: fixed; bottom: 0; width: 100%; padding: 15px; box-sizing: border-box; background: white; border-top: 1px solid #eee; }
        .btn { background: #007AFF; color: white; text-align: center; padding: 14px; border-radius: 10px; text-decoration: none; display: block; font-weight: bold; font-size: 16px; border: none; width: 100%; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="loading" class="loading-container">正在取得課程資訊...</div>
        <div id="app" style="display:none;">
          <img id="c-img" src="" alt="Course Image" />
          <div class="content">
            <h1 id="c-name"></h1>
            <div class="price" id="c-price"></div>
            <div class="desc" id="c-desc"></div>
          </div>
        </div>
      </div>
      <div class="btn-box" id="btn-container" style="display:none;">
        <button class="btn" onclick="liff.closeWindow()">關閉說明</button>
      </div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => {
          let cid = "${courseId}" || new URL(window.location.href).searchParams.get('id');
          if (!cid) {
            document.getElementById('loading').innerText = '未指定課程 ID。';
            return;
          }
          const gasUrl = "${env.APPS_SCRIPT_URL}?action=getCourseList";
          fetch(gasUrl).then(res => res.json()).then(result => {
            const course = result.data.find(c => c.id === cid);
            if (course) {
              document.getElementById('c-img').src = course.imageUrl || "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
              document.getElementById('c-name').innerText = course.name;
              document.getElementById('c-price').innerText = "NT $" + course.price + " 起";
              document.getElementById('c-desc').innerText = course.description;
              document.getElementById('loading').style.display = 'none';
              document.getElementById('app').style.display = 'block';
              document.getElementById('btn-container').style.display = 'block';
            } else {
              document.getElementById('loading').innerText = '找不到該課程資訊。';
            }
          });
        });
      </script>
    </body>
    </html>
  `;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function triggerLoadingAnimation(userId, env) {
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ chatId: userId, loadingSeconds: 5 })
    });
  } catch (e) {}
}
