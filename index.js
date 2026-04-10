import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // GET 請求處理：開啟 LIFF 說明頁面
    if (request.method === 'GET') {
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
          
          // 精確攔截關鍵字：只要包含這些關鍵字，就強制 AI 處理，不轉發 WP
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
 * 產生動態的 LIFF 課程說明網頁
 */
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
