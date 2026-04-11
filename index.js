import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-User, X-Admin-Pass'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const workerUrl = url.origin;

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    if (url.pathname === '/admin') return handleAdminPage(env);

    if (url.pathname.startsWith('/api/admin/')) {
      const user = request.headers.get('X-Admin-User');
      const pass = request.headers.get('X-Admin-Pass');
      if (user !== env.ADMIN_USERNAME || pass !== env.ADMIN_PASSWORD) return new Response('Unauthorized', { status: 401 });
      
      const gasUrl = `${env.APPS_SCRIPT_URL}?action=${url.pathname.replace('/api/admin/', '')}`;
      
      try {
        const gasResponse = await fetch(gasUrl, { redirect: 'follow' });
        const text = await gasResponse.text();
        // 這裡回傳給前端
        return new Response(text, { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({status:'error', message: e.toString()}), { status: 500, headers: corsHeaders });
      }
    }

    // LINE & LIFF 路由邏輯 (保持不變)
    if (request.method === 'GET') {
      if (url.searchParams.has('orderId')) return handleLiffPayment(url, env, workerUrl);
      return handleLiffDescription(url, env);
    }

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.events || body.events.length === 0) return new Response('OK');
        for (const event of body.events) {
          if (event.type === 'message' && event.message.type === 'text') {
            const aiKeywords = ['預約', '課程', '報名', '紀錄', '查', '訂單', '取消報名'];
            if (aiKeywords.some(k => event.message.text.includes(k))) {
              ctx.waitUntil(triggerLoadingAnimation(event.source.userId, env));
              ctx.waitUntil(handleAIRequest(event, env));
            } else { ctx.waitUntil(forwardToWP(request.clone(), env)); }
          } else { ctx.waitUntil(forwardToWP(request.clone(), env)); }
        }
        return new Response('OK');
      } catch (e) { return new Response('OK'); }
    }
    return new Response('Running', { status: 200 });
  }
};

// ... (後續渲染 handleAdminPage 與 handleLiffPayment 等內容)
// 請參考之前的 index.js 完整內容，確保 handleAdminPage 內的 JS 診斷邏輯有更新
