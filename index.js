import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';
import { handleAdminPage } from './admin_module.js';
import { handleLiffPayment, handleLiffDescription } from './liff_module.js';
import { checkSystemHealth } from './health_monitor.js';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User, X-Admin-Pass",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 1. 【極致正規化】解決 //pay 或末端斜線問題
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    if (pathname === "") pathname = "/";

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 2. 路由分流
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 3. API 代理層 (強化透傳)
    if (pathname.startsWith("/api/")) {
      const action = pathname.split('/').pop();
      const gasUrl = new URL(env.APPS_SCRIPT_URL);
      url.searchParams.forEach((v, k) => gasUrl.searchParams.set(k, v));
      gasUrl.searchParams.set("action", action);
      try {
        let body = (request.method === "POST") ? await request.text() : null;
        const gasRes = await fetch(gasUrl.toString(), { method: request.method, redirect: "follow", headers: { "Content-Type": "application/json" }, body: body });
        return new Response(await gasRes.text(), { headers: { "Content-Type": "application/json;charset=utf-8", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({status:"error", message: "Timeout"}), { status: 504, headers: corsHeaders }); }
    }

    // 4. Webhook 核心 (強制動畫)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));
          if (event.type === "message" && event.message.type === "text") {
            // 【修復：動畫必發】每一則文字訊息都優先啟動等待動畫
            await triggerLoadingAnimation(event.source.userId, env);
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
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
      body: JSON.stringify({ chatId: u, loadingSeconds: 5 })
    });
  } catch (e) {}
}
