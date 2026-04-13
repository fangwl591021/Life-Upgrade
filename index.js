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

    // 1. 路徑正規化 (處理 //pay 或末尾斜線)
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 2. 路由優先權分流
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 3. 【核心診斷修復】API 代理與參數透傳 - 解決「單號不存在」與「登入失敗」
    if (pathname.startsWith("/api/")) {
      const isAdminAction = pathname.startsWith("/api/admin/");
      const u = request.headers.get("X-Admin-User");
      const p = request.headers.get("X-Admin-Pass");

      if (isAdminAction && (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD)) {
        return new Response(JSON.stringify({status:"error", message:"Unauthorized"}), { status: 401, headers: corsHeaders });
      }

      const action = pathname.split('/').pop();
      
      // 【修復點】構建完整的 GAS URL，包含原始請求的所有參數 (如 lineUid)
      const gasUrl = new URL(env.APPS_SCRIPT_URL);
      url.searchParams.forEach((value, key) => {
        gasUrl.searchParams.set(key, value);
      });
      gasUrl.searchParams.set("action", action);
      
      try {
        let bodyText = (request.method === "POST") ? await request.text() : null;
        const gasRes = await fetch(gasUrl.toString(), { 
          method: request.method, 
          redirect: "follow", 
          headers: { "Content-Type": "application/json" }, 
          body: bodyText 
        });
        const resText = await gasRes.text();
        return new Response(resText, { headers: { "Content-Type": "application/json", ...corsHeaders } });
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
