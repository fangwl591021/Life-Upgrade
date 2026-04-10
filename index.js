import { handleAIRequest } from './adk_agent.js';
import { forwardToWP } from './wp_proxy_handler.js';

export default {
  async fetch(request, env, ctx) {
    // 處理非 POST 請求，作為健康檢查
    if (request.method !== 'POST') {
      return new Response('Webhook Hub is running', { status: 200 });
    }

    try {
      const clonedRequest = request.clone();
      const body = await request.json();

      // 確認是否為有效的 LINE Webhook 事件
      if (!body.events || body.events.length === 0) {
        return new Response('OK', { status: 200 });
      }

      for (const event of body.events) {
        // 判斷是否為文字訊息
        if (event.type === 'message' && event.message.type === 'text') {
          const text = event.message.text.trim();
          
          // 定義觸發 AI 處理的關鍵字
          const aiKeywords = ['預約', '我想上課', '購買', '查詢', '課程'];
          const isAIIntent = aiKeywords.some(keyword => text.includes(keyword));

          if (isAIIntent) {
            // 關鍵字符合，交給 AI 處理 (ctx.waitUntil 確保非同步執行不會被中斷)
            ctx.waitUntil(handleAIRequest(event, env));
          } else {
            // 關鍵字不符，轉發給舊版 WordPress 系統
            ctx.waitUntil(forwardToWP(clonedRequest, env));
          }
        } else {
          // 非文字訊息（如圖片、貼圖等），一律轉發給 WordPress 系統
          ctx.waitUntil(forwardToWP(clonedRequest, env));
        }
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error processing webhook:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};
