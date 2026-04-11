import { getCourseCategories, getCourseList, createOrder, getUserOrders } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      await createOrder(userId, courseId, amount, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, `感謝您的預約！✨ 請點擊下方按鈕完成匯款回報 💳`, generateOrderListFlexMessage(orders), env);
    } catch (e) { return await replyToLINE(event.replyToken, "預約系統忙碌中，請稍後再試。", null, env); }
  }

  const cancelMatch = userMessage.match(/我想取消報名\s*\(單號\s*[:：]\s*(.+?)\)/);
  if (cancelMatch) {
    const orderId = cancelMatch[1].trim();
    try {
      await fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'cancelOrder', data: { orderId } })});
      return await replyToLINE(event.replyToken, `已成功為您取消預約紀錄。`, null, env);
    } catch (e) { return await replyToLINE(event.replyToken, "取消失敗。", null, env); }
  }

  if (userMessage.includes('我的預約') || userMessage.includes('我的報名')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "這是您的報名紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無紀錄。", null, env);
  }

  if (userMessage === '我想看課程' || userMessage === '有哪些課程') {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(event.replyToken, "⚠️ 無法讀取課程分類，請確認 GAS 權限。", null, env);
    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const courses = await getCourseList(categoryMatch[1].trim(), env);
    if (courses && courses.length > 0) return await replyToLINE(event.replyToken, `以下是「${categoryMatch[1]}」的課程細項：`, generateCourseFlexMessage(courses), env);
    return await replyToLINE(event.replyToken, "該分類目前暫無開放課程。", null, env);
  }

  const requestBody = { model: "gpt-4o", messages: [{ role: "system", content: "你是專業課程客服。模擬 LINE OA 原生格式，不包框、不加粗字。" }, { role: "user", content: userMessage }] };
  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify(requestBody) });
    const data = await gptRes.json();
    if (data.choices[0]?.message?.content) await replyToLINE(event.replyToken, data.choices[0].message.content, null, env);
  } catch (error) {}
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = []; if (text) messages.push({ type: 'text', text }); if (flexMessage) messages.push(flexMessage);
  await fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }, body: JSON.stringify({ replyToken, messages }) });
}
