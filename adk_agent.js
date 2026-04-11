import { getCourseCategories, getCourseList, createOrder, getUserOrders } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // 1. 處理預約 (更寬鬆的 Regex)
  if (userMessage.includes('我想預約')) {
    const idMatch = userMessage.match(/編號[:：]\s*(\w+)/);
    const priceMatch = userMessage.match(/金額[:：]\s*(\d+)/);
    
    if (idMatch && priceMatch) {
      const courseId = idMatch[1];
      const amount = parseInt(priceMatch[1]);
      try {
        await createOrder(userId, courseId, amount, env);
        const orders = await getUserOrders(userId, env);
        return await replyToLINE(event.replyToken, `預約成功！請點擊下方按鈕進行匯款回報。`, generateOrderListFlexMessage(orders), env);
      } catch (e) {
        return await replyToLINE(event.replyToken, "系統忙碌中，請稍後再試。", null, env);
      }
    }
  }

  // 2. 處理取消 (寬鬆 Regex)
  if (userMessage.includes('我想取消報名')) {
    const oidMatch = userMessage.match(/單號[:：]\s*(\w+)/);
    if (oidMatch) {
      const orderId = oidMatch[1];
      try {
        const res = await fetch(env.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'cancelOrder', data: { orderId } })
        });
        return await replyToLINE(event.replyToken, `已為您取消單號: ${orderId}`, null, env);
      } catch (e) {
        return await replyToLINE(event.replyToken, "取消失敗，請稍後再試。", null, env);
      }
    }
  }

  // 3. 查詢紀錄
  if (userMessage.includes('我的預約') || userMessage.includes('我的報名')) {
    try {
      const orders = await getUserOrders(userId, env);
      if (orders && orders.length > 0) {
        return await replyToLINE(event.replyToken, "以下是您的報名紀錄：", generateOrderListFlexMessage(orders), env);
      }
      return await replyToLINE(event.replyToken, "目前查無報名紀錄。", null, env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "查詢失敗。", null, env);
    }
  }

  // 4. 開啟選單
  if (userMessage === '我想看課程' || userMessage === '課程列表') {
    try {
      const cats = await getCourseCategories(env);
      return await replyToLINE(event.replyToken, "請選擇感興趣的課程類別：", generateCategoryFlexMessage(cats), env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "無法讀取課程列表。", null, env);
    }
  }

  // 5. 類別細項
  if (userMessage.includes('我想查詢') && userMessage.includes('課程')) {
    const catName = userMessage.replace('我想查詢', '').replace('的課程', '').trim();
    try {
      const courses = await getCourseList(catName, env);
      if (courses && courses.length > 0) {
        return await replyToLINE(event.replyToken, `以下是 ${catName} 的課程：`, generateCourseFlexMessage(courses), env);
      }
    } catch (e) {}
  }

  // AI 閒聊 (OpenAI)
  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${env.OPENAI_API_KEY}` 
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "你是專業客服，回答簡短親切，不加粗、不包框、不浪費空間。" },
          { role: "user", content: userMessage }
        ]
      })
    });
    const data = await gptRes.json();
    if (data.choices?.[0]?.message?.content) {
      await replyToLINE(event.replyToken, data.choices[0].message.content, null, env);
    }
  } catch (error) {}
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: 'text', text });
  if (flexMessage) messages.push(flexMessage);
  
  return await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` 
    },
    body: JSON.stringify({ replyToken, messages })
  });
}
