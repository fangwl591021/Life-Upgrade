import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';
import { handleAdminPage } from './admin_module.js';
import { handleLiffPayment, handleLiffDescription } from './liff_module.js';
import { handleStatusPage } from './status_module.js';

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

    // --- 1. LIFF 專屬路由 (絕對優先，排除後台干擾) ---
    if (pathname === "/pay") return handleLiffPayment(orderId, env);
    if (pathname === "/desc") return handleLiffDescription(idParam, env);

    // --- 2. 管理後台入口 ---
    if (pathname === "/admin") return handleAdminPage(env);

    // --- 3. API 代理代理 (同步 GAS) ---
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

    // --- 4. Webhook 處理 (AI 客服) ---
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");
        for (const event of body.events) {
          if (event.type === "message" && event.message.type === "text") {
            const text = event.message.text.trim();
            const aiKeywords = ["預約", "課程", "報名", "紀錄", "查", "訂單", "取消", "看"];
            if (aiKeywords.some(k => text.includes(k))) {
              ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
              ctx.waitUntil(handleAIRequest(event, env));
            } else { ctx.waitUntil(forwardToWP(bodyText, request.headers, env)); }
          } else { ctx.waitUntil(forwardToWP(bodyText, request.headers, env)); }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    // --- 5. 系統狀態首頁 ---
    return handleStatusPage();
  }
};

async function triggerLoadingAnimation(u, env) {
  try { await fetch("https://api.line.me/v2/bot/chat/loading/start", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, body: JSON.stringify({ chatId: u, loadingSeconds: 5 }) }); } catch (e) {}
}
