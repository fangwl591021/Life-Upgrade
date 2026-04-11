import { getCourseCategories, getCourseList, createOrder, getUserOrders } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';
import { sendTelegramMessage } from './telegram_notifier.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 超快速路徑：預約報名處理 ---
  const orderMatch = userMessage.match(/我想預約\s*(.+?)\s*\(編號\s*:\s*(.+?)\s*,\s*金額\s*:\s*(\d+)\)/);
  if (orderMatch) {
    const courseName = orderMatch[1].trim();
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      // 呼叫 GAS 建立訂單 (包含防重機制)
      await createOrder(userId, courseId, amount, env);
      
      // 立即抓取訂單清單，準備回傳卡片
      const orders = await getUserOrders(userId, env);
      const flexMessage = generateOrderListFlexMessage(orders);
      
      // 溫暖的接待語
      const welcomeText = "感謝您的預約！請點擊下方按鈕完成匯款回報，期待在課程中與您相見歡，一起探索生命的無限可能！";

      // Telegram 內部通知
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      await sendTelegramMessage(`🛎️ 新預約申請\n👤 UID: ${userId}\n📚 課程: ${courseName}\n💰 金額: ${amount}\n⏰ 時間: ${now}`, env);

      return await replyToLINE(event.replyToken, welcomeText, flexMessage, env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "抱歉，預約連線中斷，請稍後再試。", null, env);
    }
  }

  // --- 2. 其他制式指令攔截 ---
  if (userMessage.includes('我的預約') || userMessage.includes('我的報名') || userMessage.includes('報名紀錄')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您目前的報名紀錄：", generateOrderListFlexMessage(orders), env);
    } else {
      return await replyToLINE(event.replyToken, "目前查無您的報名紀錄喔。", null, env);
    }
  }

  // 課程列表與分類 (略...)
  if (userMessage === '我想看課程' || userMessage === '有哪些課程') {
    const cats = await getCourseCategories(env);
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

  // --- 3. AI 路徑 ---
  const requestBody = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "你是專業課程客服。語氣溫暖有禮，引導用戶預約與報名。禁止使用包框或粗體。" },
      { role: "user", content: userMessage }
    ],
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
