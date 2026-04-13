import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 【Manus 準則 1：核心功能攔截 - 執行後物理 Return】 ---

  // 意圖 A：分類查詢 (解決鬼打牆)
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, "這是「" + catName + "」的精選課程：", generateCourseFlexMessage(courses), env);
    }
  }

  // 意圖 B：預約指令
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請點選選單中的「會員中心」填寫姓名，再進行預約，謝謝。", null, env);
      }
      await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) { return await replyToLINE(event.replyToken, "預約已處理中，請輸入「我的預約」查看結果。", null, env); }
  }

  // 意圖 C：看課程選單
  if (userMessage.includes("看課程") || userMessage === "我想報名" || userMessage === "選單") {
    const cats = await getCourseCategories(env);
    if (cats && cats.length > 0) {
      return await replyToLINE(event.replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
    }
  }

  // --- 【Manus 準則 2：AI 引擎服從性 - 嚴格限制閒聊】 ---
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是『人生進化 Action』專業客服。命令：嚴格禁止虛構課程，嚴格禁止閒聊。若問及非課程諮詢，請回覆：『抱歉，我只能協助本系統相關課程諮詢。』格式：不加粗、不包框、不主動詢問興趣。";
  
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] })
    });
    const oData = await oRes.json();
    const text = oData.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}

  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN }, body: JSON.stringify({ replyToken: replyToken, messages: messages }) });
}
