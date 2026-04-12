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

    // 1. 路由硬分流 (最高優先，避免後台與邏輯互相干擾)
    if (pathname === "/admin") return await handleAdminPage(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);

    // 2. 後台 API 代理 (保持與 GAS 同步)
    if (pathname.startsWith("/api/admin/")) {
      const u = request.headers.get("X-Admin-User");
      const p = request.headers.get("X-Admin-Pass");
      if (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
      const action = pathname.replace("/api/admin/", "");
      const gasUrl = env.APPS_SCRIPT_URL + "?action=" + action;
      try {
        const gasRes = await fetch(gasUrl, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: await request.text() });
        return new Response(await gasRes.text(), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({status:"error", message: e.toString()}), { status: 500, headers: corsHeaders }); }
    }

    // 3. Webhook (AI 客服與關鍵字功能)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");
        for (const event of body.events) {
          if (event.type === "message" && event.message.type === "text") {
            // 執行 AI 代理 (內含硬攔截邏輯)
            ctx.waitUntil(handleAIRequest(event, env));
          } else { ctx.waitUntil(forwardToWP(bodyText, request.headers, env)); }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return new Response("LifeUpgrade Active", { status: 200 });
  }
};
