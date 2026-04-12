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

    // 1. 路徑正規化 (解決雙斜線與手機路徑問題)
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 2. 健康監測端點 (由 Admin 或 定期監測工具呼叫)
    if (pathname === "/health") return await checkSystemHealth(env);

    // 3. 功能路由分流
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 4. Webhook 處理 (AI 客服與 WP 轉發)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // A. 轉發至 WordPress (WP) - 確保轉發不因 AI 錯誤而中斷
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          // B. AI 處理
          if (event.type === "message" && event.message.type === "text") {
            // 先啟動 Loading 動畫
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            // 處理 AI 回覆與關鍵字攔截
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { 
        // 發生嚴重錯誤時發送 TG 通知
        return new Response("OK"); 
      }
    }

    return new Response("LifeUpgrade System Running", { status: 200 });
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
