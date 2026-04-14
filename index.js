/**
 * 人生進化 Action - 核心路由與 Webhook 網關 (index.js)
 * 遵循 Manus 深度自我診斷準則 v2.5
 */

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

    // 1. 【極致路徑正規化】處理 //pay 或末端斜線，解決 Service Ready 問題
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    if (pathname === "") pathname = "/";

    // 2. 路由分流 (最高優先級)
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(url.searchParams.get("orderId"), env);
    if (pathname === "/desc") return await handleLiffDescription(url.searchParams.get("id"), env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 3. 透明 API 代理 (解決單號不存在、登入失敗)
    if (pathname.startsWith("/api/")) {
      const action = pathname.split('/').pop();
      const gasUrl = new URL(env.APPS_SCRIPT_URL);
      url.searchParams.forEach((v, k) => gasUrl.searchParams.set(k, v));
      gasUrl.searchParams.set("action", action);
      try {
        const bodyText = (request.method === "POST") ? await request.text() : null;
        const gasRes = await fetch(gasUrl.toString(), { 
          method: request.method, 
          redirect: "follow", 
          headers: { "Content-Type": "application/json" }, 
          body: bodyText 
        });
        return new Response(await gasRes.text(), { headers: { "Content-Type": "application/json;charset=utf-8", ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({status:"error", message: "API Proxy Fail"}), { status: 504, headers: corsHeaders });
      }
    }

    // 4. Webhook 核心處理 (強制動畫 + 物理隔離 AI)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // 同步轉發 WP
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          if (event.type === "message" && event.message.type === "text") {
            // 【修復】強制每一則文字訊息都優先啟動動畫
            await triggerLoadingAnimation(event.source.userId, env);
            // 處理指令攔截 (內含強制 Return 邏輯)
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
