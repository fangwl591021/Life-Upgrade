import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 處理 GET 請求：課程說明 或 匯款回報表單
    if (request.method === 'GET') {
      if (url.searchParams.has('orderId')) {
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
      if (!body.events || body.events.length === 0) return new Response('OK', { status: 200 });

      for (const event of body.events) {
        if (event.type === 'message' && event.message.type === 'text') {
          const text = event.message.text.trim();
          const aiKeywords = ['預約', '上課', '課程', '階段', '工作坊', '清單', '編號:', '哪些', '報名', '紀錄', '查', '訂單', '預約'];
          if (aiKeywords.some(k => text.includes(k))) {
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
    } catch (e) { return new Response('OK', { status: 200 }); }
  }
};

/**
 * 匯款回報表單 LIFF (優化：自動帶入註冊資料、移除身分證)
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
        input:focus { border-color: #007AFF; outline: none; background: #fff; }
        .btn { background: #007AFF; color: white; text-align: center; padding: 16px; border-radius: 12px; border: none; width: 100%; font-size: 17px; font-weight: bold; cursor: pointer; }
        .btn:disabled { background: #ccc; }
        .hint { font-size: 12px; color: #999; text-align: center; margin-top: 15px; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="font-size: 20px; font-weight: bold;">回報匯款資訊</div>
        <div style="font-size: 14px; opacity: 0.8; margin-top: 5px;">確認資訊後請按送出</div>
      </div>
      <div class="container">
        <div id="loading" style="text-align:center; padding: 50px; color:#999;">正在檢查您的資料...</div>
        <form id="payForm" style="display:none;">
          <div class="card">
            <div class="label">訂單單號</div>
            <div class="value" id="d-oid"></div>
            <div class="label">報名課程</div>
            <div class="value" id="d-name"></div>
          </div>
          
          <div class="card">
            <div class="label">學員姓名</div>
            <input type="text" id="name" placeholder="您的真實姓名" required />
            
            <div class="label">聯絡電話</div>
            <input type="tel" id="phone" placeholder="手機號碼" required />

            <div class="label">匯款帳號末五碼</div>
            <input type="number" id="last5" placeholder="請填寫末 5 位數字" pattern="[0-9]*" inputmode="numeric" required />
          </div>

          <button type="submit" class="btn" id="subBtn">確認送出</button>
          <div class="hint">送出後我們將於 1-2 個工作天內核對款項。</div>
        </form>
      </div>

      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        const oid = "${orderId}";
        const gas = "${env.APPS_SCRIPT_URL}";
        let cname = "";

        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(async () => {
          if (!liff.isLoggedIn()) { liff.login(); return; }
          const userId = liff.getDecodedIDToken().sub;
          
          try {
            // 同時取得訂單資訊與使用者個人檔案
            const [orderRes, userRes] = await Promise.all([
              fetch(gas + "?action=getUserOrders&lineUid=" + userId).then(r => r.json()),
              fetch(gas + "?action=getUserProfile&lineUid=" + userId).then(r => r.json())
            ]);

            const order = orderRes.data.find(o => o.orderId === oid);
            if (order) {
              cname = order.courseName;
              document.getElementById('d-oid').innerText = order.orderId;
              document.getElementById('d-name').innerText = order.courseName;
              
              // 如果 Users 表已有資料，則自動填入
              if (userRes.status === 'success' && userRes.data) {
                document.getElementById('name').value = userRes.data.name || "";
                document.getElementById('phone').value = userRes.data.phone || "";
              }

              document.getElementById('loading').style.display = 'none';
              document.getElementById('payForm').style.display = 'block';
            } else {
              document.getElementById('loading').innerText = '找不到訂單，請確認後再試。';
            }
          } catch(e) { document.getElementById('loading').innerText = '連線試算表失敗。'; }
        });

        document.getElementById('payForm').onsubmit = async (e) => {
          e.preventDefault();
          const btn = document.getElementById('subBtn');
          btn.disabled = true;
          btn.innerText = '提交中...';

          const data = {
            action: 'reportPayment',
            data: {
              orderId: oid,
              name: document.getElementById('name').value,
              phone: document.getElementById('phone').value,
              idCard: "", // 依要求不顯示，傳送空字串
              last5: document.getElementById('last5').value,
              courseName: cname
            }
          };

          try {
            const res = await fetch(gas, { method: 'POST', body: JSON.stringify(data) });
            const result = await res.json();
            if (result.status === 'success') {
              alert('回報成功！期待與您相見歡。');
              liff.closeWindow();
            } else { alert('提交失敗：' + result.message); btn.disabled = false; }
          } catch (err) { alert('伺服器連線錯誤'); btn.disabled = false; }
        };
      </script>
    </body>
    </html>
  `;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

async function handleLiffDescription(url, env) {
  let cid = url.searchParams.get('id');
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
        img { width: 100%; height: auto; display: block; background: #eee; min-height: 200px; }
        .content { padding: 20px; }
        h1 { font-size: 24px; margin: 0 0 10px 0; color: #000; }
        .price { color: #FF0000; font-weight: bold; font-size: 22px; margin-bottom: 20px; }
        .desc { line-height: 1.8; font-size: 16px; color: #444; border-top: 1px solid #eee; padding-top: 20px; white-space: pre-wrap; }
        .btn-box { position: fixed; bottom: 0; width: 100%; padding: 15px; box-sizing: border-box; background: white; border-top: 1px solid #eee; }
        .btn { background: #007AFF; color: white; text-align: center; padding: 14px; border-radius: 10px; border: none; width: 100%; font-size: 16px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="loading" style="padding: 100px 20px; text-align: center; color: #999;">讀取中...</div>
        <div id="app" style="display:none;">
          <img id="c-img" src="" />
          <div class="content">
            <h1 id="c-name"></h1>
            <div class="price" id="c-price"></div>
            <div id="c-desc" class="desc"></div>
          </div>
        </div>
      </div>
      <div class="btn-box" id="btn-container" style="display:none;"><button class="btn" onclick="liff.closeWindow()">關閉</button></div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => {
          fetch("${env.APPS_SCRIPT_URL}?action=getCourseList").then(res=>res.json()).then(res=>{
            const c = res.data.find(x => x.id === "${cid}");
            if(c){
              document.getElementById('c-img').src = c.imageUrl || "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
              document.getElementById('c-name').innerText = c.name;
              document.getElementById('c-price').innerText = "NT $" + c.price + " 起";
              document.getElementById('c-desc').innerText = c.description;
              document.getElementById('loading').style.display='none';
              document.getElementById('app').style.display='block';
              document.getElementById('btn-container').style.display='block';
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
