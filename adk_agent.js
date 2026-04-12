import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // 1. 【核心攔截器】 - 查詢意圖優先權最高，且執行後必須立即 return 阻斷 AI 發言
  // 針對「看課程」、「選單」、「想報名」等動作
  if (userMessage.includes("看課程") || userMessage.includes("課程選單") || userMessage === "我想報名") {
    try {
      const cats = await getCourseCategories(env);
      if (!cats || cats.length === 0) return await replyToLINE(event.replyToken, "目前暫無課程開放預約。", null, env);
      return await replyToLINE(event.replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
    } catch (e) {
      return await callDualEngineAI(event, userMessage, env);
    }
  }

  // 2. 【報名指令】 - Regex 匹配 (確保阻斷)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      // 根據維運手冊：報名前先搜 Users 表
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請點選選單中的「會員中心」填寫真實姓名與手機，再進行預約，謝謝。", null, env);
      }
      
      // 執行報名寫入
      await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
      const orders = await getUserOrders(userId, env);
      
      // 發送 Flex 確認後立即 return，阻斷 Gemini 搶話
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) {
      // 若寫入成功但後續獲取失敗，引導使用者過幾分鐘查詢
      return await callDualEngineAI(event, "您的預約資料已送出！✨ 系統紀錄更新可能稍有延遲，您可以過幾分鐘後輸入「我的預約」查看確認卡片。", env);
    }
  }

  // 3. 【分類細項與紀錄查詢】
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) return await replyToLINE(event.replyToken, "這是「" + catName + "」的最新課程細項：", generateCourseFlexMessage(courses), env);
    return await replyToLINE(event.replyToken, "抱歉，目前該分類下找不到開放預約的課程。", null, env);
  }

  if (userMessage.includes("我的預約") || userMessage.includes("我的報名")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "以下是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // 4. 【雙引擎備援】 - 僅處理無法攔截的閒聊
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是專業客服。嚴格禁止虛構課程資料。模擬 LINE 原生格式，不加粗、不包框。";
  try {
    const gRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: userMessage }] }], systemInstruction: { parts: [{ text: systemPrompt }] } })
    });
    const gData = await gRes.json();
    const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (gText) return await replyToLINE(event.replyToken, gText, null, env);
  } catch (e) {}

  // Failover to GPT-4o
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] })
    });
    const oData = await oRes.json();
    const oText = oData.choices?.[0]?.message?.content;
    if (oText) return await replyToLINE(event.replyToken, oText, null, env);
  } catch (e) {}
  await replyToLINE(event.replyToken, "系統稍嫌忙碌，請點點選單，或稍後再試。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ replyToken: replyToken, messages: messages })
  });
}
