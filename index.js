import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';
import { handleAdminPage } from './admin_module.js';
import { handleLiffPayment, handleLiffDescription } from './liff_module.js';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User, X-Admin-Pass"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const pathname = url.pathname;
    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 1. 模組化路由分流 (最高優先權)
    if (pathname === "/admin") return await handleAdminPage(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);

    // 2. API 代理服務 (同步 GAS)
    if (pathname.startsWith("/api/admin/")) {
      const u = request.headers.get("X-Admin-User");
      const p = request.headers.get("X-Admin-Pass");
      if (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
      const action = pathname.replace("/api/admin/", "");
      const gasUrl = env.APPS_SCRIPT_URL + "?action=" + action;
      try {
        const fetchOptions = { 
          method: "POST", 
          redirect: "follow", 
          headers: { "Content-Type": "text/plain;charset=utf-8" } 
        };
        if (request.method === "GET") {
          fetchOptions.method = "GET";
          delete fetchOptions.body;
        } else {
          fetchOptions.body = await request.text();
        }
        const gasRes = await fetch(gasUrl, fetchOptions);
        return new Response(await gasRes.text(), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({status:"error", message: e.toString()}), { status: 500, headers: corsHeaders }); }
    }

    // 3. Webhook 入口
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");
        for (const event of body.events) {
          if (event.type === "message" && event.message.type === "text") {
            // 確保調用 AI 代理前啟動 Loading
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            // 必須 await 處理過程
            ctx.waitUntil(handleAIRequest(event, env));
          } else { ctx.waitUntil(forwardToWP(bodyText, request.headers, env)); }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return new Response("LifeUpgrade API Active", { status: 200 });
  }
};

async function triggerLoadingAnimation(u, env) {
  try { await fetch("https://api.line.me/v2/bot/chat/loading/start", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, body: JSON.stringify({ chatId: u, loadingSeconds: 5 }) }); } catch (e) {}
}
