import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 意圖攔截器 (最優先，執行完立即 return) ---

  // 分類課程查詢 (第二層)
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, "這是「" + catName + "」的最新課程細項：", generateCourseFlexMessage(courses), env);
    }
  }

  // 報名指令 (Regex)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請點選選單中的「會員中心」填寫真實姓名，再進行報名，謝謝。", null, env);
      }
      await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) {
      return await callDualEngineAI(event, "預約處理中，但目前獲取確認卡片稍慢，請輸入「我的預約」查看。", env);
    }
  }

  // 查看選單或想報名
  if (userMessage.includes("看課程") || userMessage === "我想報名" || userMessage.includes("選單")) {
    const cats = await getCourseCategories(env);
    if (cats && cats.length > 0) {
      return await replyToLINE(event.replyToken, "請選擇感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
    }
  }

  // 查詢紀錄
  if (userMessage.includes("我的預約") || userMessage.includes("我的報名")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "這是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無紀錄喔！", null, env);
  }

  // --- 2. 雙 API 備援 (GPT-4o 優先) ---
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是專業客服。嚴格禁止虛構課程。模擬 LINE 原生格式，不加粗、不包框。";
  
  // 1. 先試 GPT-4o (第一順位)
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

  // 2. 備援 Gemini (第二順位)
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

  await replyToLINE(event.replyToken, "系統稍嫌忙碌，請稍後再試。", null, env);
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
