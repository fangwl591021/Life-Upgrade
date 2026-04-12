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

    // --- 【診斷修復 1：路徑寬容匹配】 ---
    // 使用 startsWith 確保手機端即便路徑後方帶斜線也能正確進入 LIFF 模組
    if (pathname.startsWith("/pay")) return await handleLiffPayment(orderId, env);
    if (pathname.startsWith("/desc")) return await handleLiffDescription(idParam, env);
    if (pathname.startsWith("/admin")) return await handleAdminPage(env);

    // Webhook 處理
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");

        for (const event of body.events) {
          // 確保轉發 WP 不中斷
          ctx.waitUntil(forwardToWP(bodyText, request.headers, env));

          if (event.type === "message" && event.message.type === "text") {
            ctx.waitUntil(handleAIRequest(event, env));
          }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    // fallback 頁面，若看到此內容代表路徑未匹配
    return new Response("LifeUpgrade Service Ready", { 
      status: 200, 
      headers: { "Content-Type": "text/plain; charset=utf-8" } 
    });
  }
};
