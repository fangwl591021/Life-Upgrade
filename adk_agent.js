import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 【自我診斷準則 1: 硬攔截優先級】 ---
  // 偵測到指令關鍵字時，處理完必須立即 return，禁止進入任何 AI 聊天引擎。

  // 意圖：分類查詢 (第二層) - 解決鬼打牆
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, "這是「" + catName + "」的精選課程細項：", generateCourseFlexMessage(courses), env);
    }
  }

  // 意圖：預約指令 (Regex)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請點選選單中的「會員中心」填寫真實姓名，再進行預約，謝謝配合。", null, env);
      }
      // 將姓名電話寫入 CRM 表 (D/F 欄)
      await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊按鈕完成回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "預約處理中，但目前獲取確認卡片稍慢，請輸入「我的預約」查詢結果。", null, env);
    }
  }

  // 意圖：查看選單 (第一層)
  if (userMessage.includes("看課程") || userMessage === "我想報名" || userMessage === "選單") {
    const cats = await getCourseCategories(env);
    if (cats && cats.length > 0) {
      return await replyToLINE(event.replyToken, "請選擇您感興趣的課程階段：", generateCategoryFlexMessage(cats), env);
    }
    return await replyToLINE(event.replyToken, "目前暫無課程開放預約。", null, env);
  }

  // 意圖：查詢我的預約紀錄
  if (userMessage.includes("我的預約") || userMessage.includes("紀錄")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    }
    return await replyToLINE(event.replyToken, "目前查無紀錄喔！", null, env);
  }

  // --- 【自我診斷準則 2: AI 聊天鎖死】 ---
  // 只有當完全不符合上述指令時，才由 AI 介入。
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  // 禁止閒聊的強制 Prompt
  const systemPrompt = "你是專業客服。命令：嚴禁虛構課程，嚴禁閒聊。若問及非本系統課程，請回覆：『抱歉，我只能協助本系統相關課程諮詢，請參考選單。』格式：不加粗、不包框、不主動詢問用戶興趣。";
  
  // 第一優先：GPT-4o (穩定執行指令)
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

  // 最終備援：Gemini
  try {
    const gRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: userMessage }] }], systemInstruction: { parts: [{ text: systemPrompt }] } })
    });
    const gData = await gRes.json();
    const text = gData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}

  await replyToLINE(event.replyToken, "系統稍忙，請直接使用選單查詢。", null, env);
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
