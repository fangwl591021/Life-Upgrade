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

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // GET 請求處理 LIFF 頁面
    if (request.method === 'GET') {
      try {
        if (url.searchParams.has('orderId')) return handleLiffPayment(url, env);
        if (url.searchParams.has('id')) return handleLiffDescription(url, env);
      } catch (e) {
        return new Response("LIFF Error: " + e.message, { status: 500 });
      }
      return new Response('Worker is running', { status: 200 });
    }

    // POST 請求處理 LINE Webhook
    if (request.method === 'POST') {
      try {
        const clonedRequest = request.clone();
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response('Invalid JSON', { status: 400 });
        }

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
      } catch (e) { 
        console.error(e);
        return new Response('OK'); 
      }
    }
    return new Response('Method not allowed', { status: 405 });
  }
};

async function handleLiffPayment(url, env) {
  const orderId = url.searchParams.get('orderId');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>匯款回報</title>
      <style>
        body { font-family: sans-serif; margin: 0; background: #f4f7f9; color: #333; }
        .header { background: #1DB446; color: white; padding: 25px; text-align: center; font-size: 18px; font-weight: bold; }
        .container { padding: 15px; max-width: 500px; margin: auto; }
        .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 15px; }
        .label { font-size: 13px; color: #666; margin-bottom: 4px; }
        .value { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        input { width: 100%; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; box-sizing: border-box; margin-bottom: 15px; font-size: 16px; }
        .btn { background: #007AFF; color: white; padding: 16px; border-radius: 12px; border: none; width: 100%; font-size: 17px; font-weight: bold; cursor: pointer; }
        .btn:disabled { background: #ccc; }
      </style>
    </head>
    <body>
      <div class="header">回報匯款資訊</div>
      <div class="container">
        <div id="loading" style="text-align:center; padding: 50px;">讀取訂單中...</div>
        <form id="payForm" style="display:none;">
          <div class="card">
            <div class="label">訂單單號</div><div class="value" id="d-oid"></div>
            <div class="label">報名課程</div><div class="value" id="d-name"></div>
          </div>
          <div class="card">
            <div class="label">真實姓名</div><input type="text" id="name" placeholder="請輸入姓名" required />
            <div class="label">聯絡電話</div><input type="tel" id="phone" placeholder="請輸入電話" required />
            <div class="label">帳號末五碼</div><input type="number" id="last5" placeholder="請輸入匯款後五碼" required />
          </div>
          <button type="submit" class="btn" id="subBtn">確認送出</button>
        </form>
      </div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        const oid = "${orderId}";
        const gas = "${env.APPS_SCRIPT_URL}";
        let cData = {};

        async function init() {
          try {
            await liff.init({ liffId: "2009130603-ktCTGk6d" });
            if (!liff.isLoggedIn()) { liff.login(); return; }
            const userId = liff.getDecodedIDToken().sub;
            
            const [oRes, pRes] = await Promise.all([
              fetch(gas+"?action=getUserOrders&lineUid="+userId).then(r=>r.json()).catch(()=>({data:[]})),
              fetch(gas+"?action=getUserProfile&lineUid="+userId).then(r=>r.json()).catch(()=>({data:null}))
            ]);

            const order = (oRes.data || []).find(o => o.orderId === oid);
            if (!order) { 
              document.getElementById('loading').innerHTML = '<div style="color:red">⚠️ 找不到此訂單或已過期</div>'; 
              return; 
            }

            cData = order;
            document.getElementById('d-oid').innerText = order.orderId;
            document.getElementById('d-name').innerText = order.courseName;
            
            if (pRes.data) {
              document.getElementById('name').value = pRes.data.name || "";
              document.getElementById('phone').value = pRes.data.phone || "";
            }

            document.getElementById('loading').style.display = 'none';
            document.getElementById('payForm').style.display = 'block';
          } catch(e) {
            document.getElementById('loading').innerText = "發生錯誤: " + e.message;
          }
        }

        document.getElementById('payForm').onsubmit = async (e) => {
          e.preventDefault();
          const btn = document.getElementById('subBtn');
          btn.disabled = true;
          btn.innerText = "傳送中...";
          
          try {
            const res = await fetch(gas, { 
              method: 'POST', 
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                action: 'reportPayment',
                data: { 
                  orderId: oid, 
                  name: document.getElementById('name').value, 
                  phone: document.getElementById('phone').value, 
                  last5: document.getElementById('last5').value, 
                  courseName: cData.courseName, 
                  amount: cData.amount 
                }
              })
            });
            const result = await res.json();
            if (result.status === 'success') { 
              alert('回報成功！'); 
              liff.closeWindow(); 
            } else { 
              alert('錯誤: ' + (result.message || '回報失敗')); 
              btn.disabled = false;
              btn.innerText = "確認送出";
            }
          } catch(err) {
            alert('系統連線失敗');
            btn.disabled = false;
          }
        };

        init();
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
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, sans-serif; margin: 0; background: #fff; color: #333; }
        .container { padding-bottom: 80px; }
        .img-box { width: 100%; aspect-ratio: 16/9; background: #eee; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        img { width: 100%; height: 100%; object-fit: cover; }
        .content { padding: 20px; }
        h1 { font-size: 22px; margin: 0 0 10px 0; line-height: 1.4; }
        .price { color: #f44336; font-weight: bold; font-size: 20px; margin-bottom: 15px; }
        .desc { line-height: 1.6; white-space: pre-wrap; font-size: 16px; color: #555; }
        .btn-box { position: fixed; bottom: 0; width: 100%; padding: 15px; background: #fff; box-sizing: border-box; border-top: 1px solid #eee; }
        .btn { background: #007AFF; color: #fff; text-align: center; padding: 14px; border-radius: 10px; border: none; width: 100%; font-weight: bold; cursor: pointer; font-size: 17px; }
      </style>
    </head>
    <body>
      <div id="loading" style="padding: 100px 20px; text-align: center; color: #999;">讀取課程詳情...</div>
      <div id="app" style="display:none;">
        <div class="img-box"><img id="c-img" src="" onerror="this.style.display='none'" /></div>
        <div class="content">
          <h1 id="c-name"></h1>
          <div class="price" id="c-price"></div>
          <div id="c-desc" class="desc"></div>
        </div>
      </div>
      <div class="btn-box" id="btn-container" style="display:none;"><button class="btn" onclick="liff.closeWindow()">關閉視窗</button></div>
      <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      <script>
        async function load() {
          try {
            await liff.init({ liffId: "2009130603-ktCTGk6d" });
            const res = await fetch("${env.APPS_SCRIPT_URL}?action=getCourseList").then(r=>r.json());
            const c = res.data.find(x => x.id === "${cid}");
            if(c){
              document.getElementById('c-img').src = c.imageUrl || "";
              document.getElementById('c-name').innerText = c.name;
              document.getElementById('c-price').innerText = "NT$ " + Number(c.price).toLocaleString();
              document.getElementById('c-desc').innerText = c.description;
              document.getElementById('loading').style.display='none';
              document.getElementById('app').style.display='block';
              document.getElementById('btn-container').style.display='block';
            } else {
              document.getElementById('loading').innerText = "找不到課程資訊";
            }
          } catch(e) {
            document.getElementById('loading').innerText = "載入失敗";
          }
        }
        load();
      </script>
    </body>
    </html>
  `;
  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}
