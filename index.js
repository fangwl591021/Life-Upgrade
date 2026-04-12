import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';
import { handleAdminPage } from './admin_module.js';
import { handleLiffPayment, handleLiffDescription } from './liff_module.js';
import { checkSystemHealth } from './health_monitor.js';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 【診斷修復：極致路徑正規化】
    let pathname = url.pathname.replace(/\/+/g, '/'); // 處理雙斜線
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 1. 最高優先權：監控與功能分流
    if (pathname === "/health") return await checkSystemHealth(env);
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 2. Webhook 處理
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // 確保 WP 轉發不因 AI 錯誤而中斷
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          if (event.type === "message" && event.message.type === "text") {
            // 【修復：動畫優先啟動】
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return new Response("LifeUpgrade System Ready", { status: 200 });
  }
};

async function triggerLoadingAnimation(u, env) {
  try {
    await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN 
      },
      body: JSON.stringify({ chatId: u, loadingSeconds: 5 })
    });
  } catch (e) {}
}
