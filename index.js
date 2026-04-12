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

    // --- 【深度診斷修復：路徑正規化】 ---
    // 解決手機端或跳轉產生的雙斜線問題 (如 //pay 轉為 /pay)
    let pathname = url.pathname.replace(/\/+/g, '/');
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    const orderId = url.searchParams.get("orderId");
    const idParam = url.searchParams.get("id");

    // 1. LIFF 與 路由硬分流 (使用正規化後的 pathname)
    if (pathname === "/pay") return await handleLiffPayment(orderId, env);
    if (pathname === "/desc") return await handleLiffDescription(idParam, env);
    if (pathname === "/admin") return await handleAdminPage(env);

    // 2. Webhook 處理 (AI 助理與 WordPress 轉發)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // A. 轉發至 WordPress (WP) 
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          // B. AI 客服關鍵字處理
          if (event.type === "message" && event.message.type === "text") {
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    // fallback 頁面
    return new Response("LifeUpgrade Service Ready", { 
      status: 200, 
      headers: { "Content-Type": "text/plain; charset=utf-8" } 
    });
  }
};
