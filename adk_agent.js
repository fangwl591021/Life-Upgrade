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
        const flex = generateOrderListFlexMessage(orders);
        return await replyToLINE(event.replyToken, `預約成功！✨ 請點擊下方按鈕進行匯款回報。`, flex, env);
      } catch (e) {
        return await replyToLINE(event.replyToken, "系統忙碌中，請稍後再試。", null, env);
      }
    }
  }

  // 2. 處理取消
  if (userMessage.includes('我想取消報名')) {
    const oidMatch = userMessage.match(/單號[:：]\s*(\w+)/);
    if (oidMatch) {
      const orderId = oidMatch[1];
      try {
        await fetch(env.APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'cancelOrder', data: { orderId } })
        });
        return await replyToLINE(event.replyToken, `已成功取消預約：${orderId}`, null, env);
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
        const flex = generateOrderListFlexMessage(orders);
        return await replyToLINE(event.replyToken, "這是您的報名紀錄：", flex, env);
      }
      return await replyToLINE(event.replyToken, "目前查無報名紀錄。", null, env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "查詢失敗。", null, env);
    }
  }

  // 4. 開啟選單 (修正 Flex 顯示問題)
  if (userMessage === '我想看課程' || userMessage === '課程列表') {
    try {
      const cats = await getCourseCategories(env);
      const flex = generateCategoryFlexMessage(cats);
      // 如果 Flex 產生失敗或為空，則顯示純文字
      if (!flex) {
        return await replyToLINE(event.replyToken, "目前沒有可選的課程類別。", null, env);
      }
      return await replyToLINE(event.replyToken, "請選擇課程類型：", flex, env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "讀取選單失敗，請稍後再試。", null, env);
    }
  }

  // 5. 類別細項
  if (userMessage.includes('我想查詢') && userMessage.includes('課程')) {
    const catName = userMessage.replace('我想查詢', '').replace('的課程', '').trim();
    try {
      const courses = await getCourseList(catName, env);
      if (courses && courses.length > 0) {
        const flex = generateCourseFlexMessage(courses);
        return await replyToLINE(event.replyToken, `以下是 ${catName} 的課程細項：`, flex, env);
      }
    } catch (e) {}
  }

  // AI 客服 (OpenAI)
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
  if (text) {
    messages.push({ type: 'text', text: text });
  }
  
  // 確保 flexMessage 存在且格式正確
  if (flexMessage) {
    // 如果 flexMessage 本身已經包含了 type: 'flex' 則直接推入，否則包裹一層
    if (flexMessage.type === 'flex') {
      messages.push(flexMessage);
    } else if (flexMessage.contents) {
      messages.push({
        type: 'flex',
        altText: '選單內容',
        contents: flexMessage.contents
      });
    } else {
      // 如果 template 直接回傳了 contents 結構
      messages.push({
        type: 'flex',
        altText: '選單內容',
        contents: flexMessage
      });
    }
  }
  
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` 
    },
    body: JSON.stringify({ replyToken, messages })
  });
  
  return res;
}
