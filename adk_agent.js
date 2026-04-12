import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  const geminiKey = env.GEMINI_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;

  // 1. 識別報名預約意圖 (精準 Regex)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      // 核心邏輯：報名檢查
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請點選選單中的「會員中心」填寫真實姓名與手機，再進行報名，謝謝。", null, env);
      }

      await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) {
      // 若報名成功但後續獲取紀錄失敗，嘗試用 AI 安撫
      const fallbackMsg = "您的預約資料已送出！✨ 系統紀錄更新可能稍有延遲，您可以過幾分鐘後輸入「我的預約」查看確認卡片。";
      return await callDualEngineAI(event, userMessage, fallbackMsg, env);
    }
  }

  // 2. 識別查看課程與分類意圖
  if (userMessage === "我想看課程" || userMessage === "我想報名" || userMessage.includes("課程選單")) {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(event.replyToken, "目前暫無課程開放預約。", null, env);
    return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) return await replyToLINE(event.replyToken, "這是「" + catName + "」的最新課程：", generateCourseFlexMessage(courses), env);
  }

  // 3. 查詢紀錄
  if (userMessage.includes("我的預約") || userMessage.includes("我的報名")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "以下是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // 4. AI 雙引擎回應 (處理閒聊與 failover)
  return await callDualEngineAI(event, userMessage, null, env);
}

async function callDualEngineAI(event, userMessage, customPrompt, env) {
  const systemPrompt = "你是專業客服。嚴格禁止虛構課程。格式簡潔親切，不加粗不包框。";
  const finalPrompt = customPrompt ? customPrompt : userMessage;

  // 先試 Gemini
  try {
    const gRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] } })
    });
    const gData = await gRes.json();
    const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (gText) return await replyToLINE(event.replyToken, gText, null, env);
  } catch (e) {}

  // Gemini 忙碌，GPT-4o 接手
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: finalPrompt }] })
    });
    const oData = await oRes.json();
    const oText = oData.choices?.[0]?.message?.content;
    if (oText) return await replyToLINE(event.replyToken, oText, null, env);
  } catch (e) {}

  await replyToLINE(event.replyToken, "抱歉，系統暫時無法解析您的需求。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = []; if (text) messages.push({ type: "text", text: text }); if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ replyToken: replyToken, messages: messages })
  });
}
