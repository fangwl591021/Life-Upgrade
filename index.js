import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const workerUrl = url.origin;

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    if (request.method === 'GET') {
      if (url.searchParams.has('orderId')) return handleLiffPayment(url, env, workerUrl);
      return handleLiffDescription(url, env);
    }

    if (request.method === 'POST') {
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
    return new Response('Running', { status: 200 });
  }
};

async function handleLiffPayment(url, env, workerUrl) {
  const orderId = url.searchParams.get('orderId');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>匯款回報資訊</title>
      <style>
        body { font-family: -apple-system, sans-serif; margin: 0; background: #f4f7f9; color: #333; padding-bottom: 40px; }
        .header { background: #1DB446; color: white; padding: 25px 20px; text-align: center; }
        .container { padding: 15px; max-width: 500px; margin: auto; }
        .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 15px; }
        .label { font-size: 14px; color: #000; margin-bottom: 5px; font-weight: bold; }
        .value { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #000; }
        input { width: 100%; padding: 14px; border: 1px solid #e0e0e0; border-radius: 10px; box-sizing: border-box; font-size: 16px; margin-bottom: 15px; background: #fafafa; color: #000; }
        .btn { background: #007AFF; color: white; text-align: center; padding: 16px; border-radius: 12px; border: none; width: 100%; font-size: 17px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="header"><div style="font-size: 20px; font-weight: bold;">回報匯款資訊</div></div>
      <div class="container">
        <div id="loading" style="text-align:center; padding: 50px; color:#000; font-weight:bold; font-size:18px;">檢查資料中...</div>
        <form id="payForm" style="display:none;">
          <div class="card">
            <div class="label">訂單單號</div><div class="value" id="d-oid"></div>
            <div class="label">報名課程</div><div class="value" id="d-name"></div>
          </div>
          <div class="card">
            <div class="label">學員真實姓名</div><input type="text" id="name" required />
            <div class="label">聯絡電話</div><input type="tel" id="phone" required />
            <div class="label">匯款帳號末五碼</div><input type="number" id="last5" pattern="[0-9]*" inputmode="numeric" required />
          </div>
          <button type="submit" class="btn" id="subBtn">確認送出回報</button>
        </form>
      </div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        const oid = "${orderId}";
        const gasUrl = "${env.APPS_SCRIPT_URL}";
        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(async () => {
          if (!liff.isLoggedIn()) { liff.login(); return; }
          const userId = liff.getDecodedIDToken().sub;
          const [orderRes, userRes] = await Promise.all([
            fetch(gasUrl + "?action=getUserOrders&lineUid=" + userId).then(r => r.json()),
            fetch(gasUrl + "?action=getUserProfile&lineUid=" + userId).then(r => r.json())
          ]);
          const order = orderRes.data.find(o => o.orderId === oid);
          if (!order) {
            document.getElementById('loading').innerText = '此單號已取消或不存在。';
            document.getElementById('loading').style.color = '#FF0000';
            return;
          }
          document.getElementById('d-oid').innerText = order.orderId;
          document.getElementById('d-name').innerText = order.courseName;
          if (userRes.data) {
            document.getElementById('name').value = userRes.data.name || "";
            document.getElementById('phone').value = userRes.data.phone || "";
          }
          document.getElementById('loading').style.display = 'none';
          document.getElementById('payForm').style.display = 'block';
        });

        document.getElementById('payForm').onsubmit = async (e) => {
          e.preventDefault();
          const btn = document.getElementById('subBtn');
          btn.disabled = true;
          const res = await fetch(gasUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'reportPayment',
              data: { 
                orderId: oid, name: document.getElementById('name').value, 
                phone: document.getElementById('phone').value, last5: document.getElementById('last5').value,
                courseName: document.getElementById('d-name').innerText,
                amount: 0 // 由 GAS 自動比對
              }
            })
          });
          const result = await res.json();
          if (result.status === 'success') { alert('回報完成！'); liff.closeWindow(); }
          else { alert('錯誤：' + result.message); btn.disabled = false; }
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
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, sans-serif; margin: 0; background: #fff; }
        .container { padding-bottom: 80px; }
        img { width: 100%; height: auto; background: #eee; }
        .content { padding: 20px; }
        .price { color: #f00; font-weight: bold; font-size: 22px; margin: 10px 0; }
        .desc { line-height: 1.7; white-space: pre-wrap; color: #000; font-size: 18px; }
        .btn-box { position: fixed; bottom: 0; width: 100%; padding: 15px; background: #fff; box-sizing: border-box; border-top: 1px solid #eee; }
        .btn { background: #007AFF; color: #fff; text-align: center; padding: 14px; border-radius: 10px; border: none; width: 100%; font-weight: bold; cursor: pointer; font-size: 18px; }
      </style>
    </head>
    <body>
      <div id="loading" style="padding: 100px 20px; text-align: center; font-size: 18px;">讀取中...</div>
      <div id="app" style="display:none;">
        <img id="c-img" src="" /><div class="content"><h1 id="c-name"></h1><div class="price" id="c-price"></div><div id="c-desc" class="desc"></div></div>
      </div>
      <div class="btn-box" id="btn-container" style="display:none;"><button class="btn" onclick="liff.closeWindow()">關閉</button></div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        liff.init({ liffId: "2009130603-ktCTGk6d" }).then(() => {
          fetch("${env.APPS_SCRIPT_URL}?action=getCourseList").then(r=>r.json()).then(res=>{
            const c = res.data.find(x => x.id === "${cid}");
            if(c){
              document.getElementById('c-img').src = c.imageUrl || "";
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
