import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 【準則 2：硬攔截優先級】 ---
  // 偵測到關鍵字指令，執行功能並立即 return，阻斷後方所有 AI 引擎呼叫。

  // 1. 分類課程查詢 (第二層) - 解決鬼打牆
  // 對應按鈕文字："我想查詢 [分類名稱] 的課程"
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    try {
      const courses = await getCourseList(catName, env);
      if (courses && courses.length > 0) {
        return await replyToLINE(event.replyToken, "這是「" + catName + "」的最新課程：", generateCourseFlexMessage(courses), env);
      }
    } catch (e) {
      console.error("Course List Fetch Error:", e);
    }
  }

  // 2. 處理報名預約 (Regex)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成學員註冊喔！✨\n請先點選選單中的「會員中心」填寫真實姓名與手機，再進行報名，謝謝您的配合。", null, env);
      }
      await createOrder({ lineUid: userId, userName: profile.name, userPhone: profile.phone, courseId: courseId, amount: amount }, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) {
      return await replyToLINE(event.replyToken, "預約已處理中，但獲取確認卡片稍慢，請稍後輸入「我的預約」查詢結果。", null, env);
    }
  }

  // 3. 基礎選單查詢 (看課程)
  if (userMessage.includes("看課程") || userMessage === "我想報名" || userMessage === "課程選單") {
    try {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(event.replyToken, "請選擇您感興趣的課程階段：", generateCategoryFlexMessage(cats), env);
      }
      return await replyToLINE(event.replyToken, "目前暫無課程開放預約，請稍後再試。", null, env);
    } catch (e) {
      console.error("Category Fetch Error:", e);
    }
  }

  // 4. 我的預約查詢
  if (userMessage.includes("我的預約") || userMessage.includes("紀錄")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的最新預約紀錄：", generateOrderListFlexMessage(orders), env);
    }
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // --- 【準則 3：AI 服從性診斷】 ---
  // GPT-4o 優先順位，禁止閒聊與虛構。
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是『人生進化 Action』專業客服。核心命令：1. 嚴禁虛構課程 2. 嚴禁閒聊 3. 嚴禁詢問用戶興趣。若使用者問及非本系統功能，請回覆：『抱歉，我只能協助本系統相關課程諮詢，請參考選單。』格式：不加粗、不包框。";
  
  // 第一優先：GPT-4o (穩定)
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

  await replyToLINE(event.replyToken, "系統稍忙，請直接使用功能選單查詢。", null, env);
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
