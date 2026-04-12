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

    // 1. 路徑正規化
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 2. 健康監測與分流 (最高優先級)
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 3. 【核心修復】API 代理服務 (解決 Admin 登入與 LIFF 網路錯誤)
    if (pathname.startsWith("/api/")) {
      const isPublicAction = pathname.includes("reportPayment") || pathname.includes("getUser");
      const isAdminAction = pathname.startsWith("/api/admin/");
      
      // Admin 權限驗證
      if (isAdminAction) {
        const u = request.headers.get("X-Admin-User");
        const p = request.headers.get("X-Admin-Pass");
        if (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
      }

      const action = pathname.split('/').pop();
      const gasUrl = env.APPS_SCRIPT_URL + "?action=" + action;
      
      try {
        let body = null;
        if (request.method === "POST") {
          body = await request.text();
        }
        
        const gasRes = await fetch(gasUrl, {
          method: request.method,
          redirect: "follow",
          headers: { "Content-Type": "application/json" },
          body: body
        });
        
        return new Response(await gasRes.text(), { 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      } catch (e) {
        return new Response(JSON.stringify({status:"error", message: e.toString()}), { status: 500, headers: corsHeaders });
      }
    }

    // 4. Webhook 處理
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));
          if (event.type === "message" && event.message.type === "text") {
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return new Response("LifeUpgrade Service Active", { status: 200 });
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
