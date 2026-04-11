import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile, cancelOrder } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';
import { sendTelegramMessage } from './telegram_notifier.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 預約報名處理 ---
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseName = orderMatch[1].trim(); 
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      await createOrder(userId, courseId, amount, env);
      const orders = await getUserOrders(userId, env);
      const flexMessage = generateOrderListFlexMessage(orders);
      const welcomeText = `感謝您的預約！請點擊下方按鈕完成匯款回報，期待在課程中與您相見歡，一起探索生命的無限可能！`;

      const profile = await getUserProfile(userId, env);
      const displayName = (profile && profile.name) ? profile.name : `UID: ${userId}`;
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      await sendTelegramMessage(`🛎️ 新預約申請通知\n__________________\n\n👤 預約人 : ${displayName}\n📚 課程名稱 : ${courseName}\n💰 預約金額 : ${amount} 元\n⏰ 預約時間 : ${now}`, env);

      return await replyToLINE(event.replyToken, welcomeText, flexMessage, env);
    } catch (e) { return await replyToLINE(event.replyToken, "預約系統忙碌中，請稍後再試。", null, env); }
  }

  // --- 2. 取消報名處理 ---
  const cancelMatch = userMessage.match(/我想取消報名\s*\(單號\s*[:：]\s*(.+?)\)/);
  if (cancelMatch) {
    const orderId = cancelMatch[1].trim();
    try {
      const orders = await getUserOrders(userId, env);
      const targetOrder = orders.find(o => o.orderId === orderId);
      const cancelAmount = targetOrder ? targetOrder.amount : 0;

      await cancelOrder(orderId, env);

      const profile = await getUserProfile(userId, env);
      const displayName = (profile && profile.name) ? profile.name : `UID: ${userId}`;
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      await sendTelegramMessage(`🗑️ 取消預約通知\n__________________\n\n🆔 訂單單號 : ${orderId}\n👤 取消學員 : ${displayName}\n💰 原始金額 : ${cancelAmount} 元\n⏰ 取消時間 : ${now}`, env);

      return await replyToLINE(event.replyToken, `已成功為您取消單號 ${orderId} 的預約紀錄。`, null, env);
    } catch (e) { return await replyToLINE(event.replyToken, "取消失敗，請聯繫客服。", null, env); }
  }

  // --- 3. 查詢報名紀錄 ---
  if (userMessage.includes('我的預約') || userMessage.includes('我的報名') || userMessage.includes('報名紀錄')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您目前的報名預約紀錄：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "目前查無您的預約紀錄喔。", null, env);
    }
  }

  // --- 4. 課程首頁 ---
  if (userMessage === '我想看課程' || userMessage === '有哪些課程') {
    const cats = await getCourseCategories(env);
    
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    await sendTelegramMessage(`🔔 TG推播測試成功\n__________________\n\n有人在 LINE 點擊了「${userMessage}」\n時間 : ${now}`, env);

    if (!cats || cats.length === 0) {
      return await replyToLINE(event.replyToken, "⚠️ 系統無法讀取課程清單，請確認 GAS 權限是否設為「所有人」。", null, env);
    }

    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const cat = categoryMatch[1].trim();
    const courses = await getCourseList(cat, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, `以下是「${cat}」的課程細項：`, generateCourseFlexMessage(courses), env);
    }
  }

  const requestBody = {
    model: "gpt-4o",
    messages: [{ role: "system", content: "你是專業客服。模擬 LINE OA 原生格式，不包框、不加粗字。" }, { role: "user", content: userMessage }],
    tool_choice: "auto"
  };

  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify(requestBody)
    });
    const data = await gptRes.json();
    const message = data.choices[0]?.message;
    if (message?.content) await replyToLINE(event.replyToken, message.content, null, env);
  } catch (error) {}
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: 'text', text: text });
  if (flexMessage) messages.push(flexMessage);
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages })
  });
}
