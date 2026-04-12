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

    // 1. 【診斷修復】LIFF 與 路由硬分流 - 解決手機跳轉與點擊問題
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 2. LINE Webhook 處理 - 解決 WP 沒反應與 AI 搶話
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // A. 轉發至 WordPress (WP) - 確保轉發最優先且被記錄
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          // B. AI 客服關鍵字處理 (含硬阻斷邏輯)
          if (event.type === "message" && event.message.type === "text") {
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return new Response("LifeUpgrade Service Ready", { status: 200 });
  }
};
