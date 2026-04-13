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

    // 【診斷修復：路徑正規化】處理 //pay 或末尾斜線問題
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 1. 路由硬分流 (最高優先權)
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 2. 【核心診斷修復】API 代理與參數透傳 - 解決後台登入失敗與單號不存在
    if (pathname.startsWith("/api/")) {
      const isAdminAction = pathname.startsWith("/api/admin/");
      const u = request.headers.get("X-Admin-User");
      const p = request.headers.get("X-Admin-Pass");

      if (isAdminAction && (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD)) {
        return new Response(JSON.stringify({status:"error", message:"Unauthorized"}), { status: 401, headers: corsHeaders });
      }

      const action = pathname.split('/').pop();
      const gasUrl = new URL(env.APPS_SCRIPT_URL);
      // 透傳所有 Query Params (如 lineUid)
      url.searchParams.forEach((v, k) => gasUrl.searchParams.set(k, v));
      gasUrl.searchParams.set("action", action);
      
      try {
        let bodyText = (request.method === "POST") ? await request.text() : null;
        const gasRes = await fetch(gasUrl.toString(), { 
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

    // 3. LINE Webhook 處理
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // A. 轉發至 WordPress (同步)
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          // B. 文字訊息處理 (含強制動畫)
          if (event.type === "message" && event.message.type === "text") {
            // 【修復：動畫必發】每一則文字訊息都優先啟動等待動畫
            await triggerLoadingAnimation(event.source.userId, env);
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
