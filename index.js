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

    // 1. 專屬模組分流 (路由中心)
    if (pathname === "/admin") return handleAdminPage(env);
    if (pathname === "/pay") return handleLiffPayment(orderId, env);
    if (pathname === "/desc") return handleLiffDescription(idParam, env);

    // 2. API 代理 (同步 GAS)
    if (pathname.startsWith("/api/admin/")) {
      const u = request.headers.get("X-Admin-User");
      const p = request.headers.get("X-Admin-Pass");
      if (u !== env.ADMIN_USERNAME || p !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
      const action = pathname.replace("/api/admin/", "");
      const gasUrl = env.APPS_SCRIPT_URL + "?action=" + action;
      try {
        const fetchOptions = { 
          method: "POST", 
          redirect: "follow", 
          headers: { "Content-Type": "text/plain;charset=utf-8" } 
        };
        if (request.method === "GET") {
          fetchOptions.method = "GET";
          delete fetchOptions.body;
        } else { fetchOptions.body = await request.text(); }
        const gasRes = await fetch(gasUrl, fetchOptions);
        return new Response(await gasRes.text(), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) { return new Response(JSON.stringify({status:"error", message: e.toString()}), { status: 500, headers: corsHeaders }); }
    }

    // 3. Webhook 入口
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const body = JSON.parse(bodyText);
        if (!body.events || body.events.length === 0) return new Response("OK");
        for (const event of body.events) {
          if (event.type === "message" && event.message.type === "text") {
            ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
            ctx.waitUntil(handleAIRequest(event, env));
          } else { ctx.waitUntil(forwardToWP(bodyText, request.headers, env)); }
        }
        return new Response("OK");
      } catch (e) { return new Response("OK"); }
    }

    return handleStatusPage();
  }
};

async function triggerLoadingAnimation(u, env) {
  try { await fetch("https://api.line.me/v2/bot/chat/loading/start", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, body: JSON.stringify({ chatId: u, loadingSeconds: 5 }) }); } catch (e) {}
}

function handleStatusPage() {
  const h = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Action Pro</title><script src="https://cdn.tailwindcss.com"></script></head>',
    '<body class="bg-slate-50 flex items-center justify-center min-h-screen font-sans">',
    '<div class="max-w-md w-full bg-white p-12 rounded-[2.5rem] shadow-xl text-center border border-slate-100">',
    '<h1 class="text-2xl font-semibold text-slate-800 mb-6 tracking-tight">人生進化 Action</h1>',
    '<p class="text-slate-500 mb-8">系統模組化運行中。</p>',
    '<a href="/admin" class="block bg-blue-600 text-white py-4 rounded-xl font-medium shadow-lg transition hover:bg-blue-700 text-lg">進入管理系統</a>',
    '</div></body></html>'
  ].join("");
  return new Response(h, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}
