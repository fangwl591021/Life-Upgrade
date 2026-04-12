import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';
import { handleAdminPage } from './admin_module.js';
import { handleLiffPayment, handleLiffDescription } from './liff_module.js';
import { checkSystemHealth } from './health_monitor.js';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User, X-Admin-Pass"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 1. 【深度修復：路徑正規化準則】處理雙斜線問題
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 2. 分流邏輯 (最高優先級)
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 3. API 代理服務 (負責後台認證與資料傳輸)
    if (pathname.startsWith("/api/")) {
      const isAdminAction = pathname.startsWith("/api/admin/");
      if (isAdminAction) {
        const u = request.headers.get("X-Admin-User");
        const p = request.headers.get("X-Admin-Pass");
        if (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
      }

      const action = pathname.split('/').pop();
      const gasUrl = env.APPS_SCRIPT_URL + "?action=" + action;
      
      try {
        let bodyText = (request.method === "POST") ? await request.text() : null;
        const gasRes = await fetch(gasUrl, { 
          method: request.method, 
          redirect: "follow", 
          headers: { "Content-Type": "application/json" }, 
          body: bodyText 
        });
        return new Response(await gasRes.text(), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({status:"error", message: e.toString()}), { status: 500, headers: corsHeaders });
      }
    }

    // 4. Webhook 核心 (AI 與 WP 同步)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // 確保同步轉發至 WP
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          if (event.type === "message" && event.message.type === "text") {
            // 先啟動動畫，後執行邏輯
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return new Response("LifeUpgrade Service Ready", { status: 200 });
  }
};

async function triggerLoadingAnimation(u, env) {
  try {
    await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN },
      body: JSON.stringify({ chatId: u, loadingSeconds: 5 })
    });
  } catch (e) {}
}
