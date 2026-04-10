import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Webhook Hub is running', { status: 200 });
    }

    try {
      const clonedRequest = request.clone();
      const body = await request.json();

      if (!body.events || body.events.length === 0) {
        return new Response('OK', { status: 200 });
      }

      for (const event of body.events) {
        if (event.type === 'message' && event.message.type === 'text') {
          const text = event.message.text.trim();
          
          // 擴增關鍵字，避免「列給我看」被漏接轉發給舊系統
          const aiKeywords = ['預約', '上課', '購買', '查詢', '課程', '清單', '列', '有哪些', '什麼課'];
          const isAIIntent = aiKeywords.some(keyword => text.includes(keyword));

          if (isAIIntent) {
            ctx.waitUntil(handleAIRequest(event, env));
          } else {
            ctx.waitUntil(forwardToWP(clonedRequest, env));
          }
        } else {
          ctx.waitUntil(forwardToWP(clonedRequest, env));
        }
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error processing webhook:', error);
      // 回傳 200 避免 LINE 伺服器因為錯誤而一直重複發送舊訊息
      return new Response('OK', { status: 200 }); 
    }
  }
};
