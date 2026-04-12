import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 【第二層】分類課程查詢 (優先處理，解決鬼打牆問題) ---
  // 對應按鈕文字："我想查詢 一般課程 的課程"
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    try {
      const courses = await getCourseList(catName, env);
      if (courses && courses.length > 0) {
        // 成功取得課程清單，立即發送並 return
        return await replyToLINE(event.replyToken, "這是「" + catName + "」分類下的精選課程：", generateCourseFlexMessage(courses), env);
      } else {
        return await replyToLINE(event.replyToken, "抱歉，目前「" + catName + "」分類下暫無開放預約的課程。", null, env);
      }
    } catch (e) {
      return await callDualEngineAI(event, userMessage, env);
    }
  }

  // --- 2. 【核心動作】處理報名預約 (Regex) ---
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      // 根據維運手冊：報名前強制檢查 Users 表
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成註冊喔！✨\n請點選選單中的「會員中心」填寫真實姓名與手機，再進行預約，謝謝您的配合。", null, env);
      }

      // 已註冊：將 profile.name(B欄) 與 profile.phone(E欄) 寫入 CRM
      await createOrder({
        lineUid: userId,
        userName: profile.name,
        userPhone: profile.phone,
        courseId: courseId,
        amount: amount
      }, env);

      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) {
      return await callDualEngineAI(event, "報名資料已寫入但獲取卡片稍慢，請引導使用者輸入「我的預約」查看。", env);
    }
  }

  // --- 3. 【第一層】查看課程大類 ---
  if (userMessage.includes("看課程") || userMessage === "我想報名" || userMessage.includes("課程選單")) {
    try {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(event.replyToken, "請選擇您感興趣的課程階段：", generateCategoryFlexMessage(cats), env);
      }
    } catch (e) { return await callDualEngineAI(event, userMessage, env); }
  }

  // --- 4. 【個人功能】查詢我的預約 ---
  if (userMessage.includes("我的預約") || userMessage.includes("我的報名")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "這是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // --- 5. 【雙引擎備援】僅處理閒聊 ---
  return await callDualEngineAI(event, userMessage, env);
}

async function callDualEngineAI(event, userMessage, env) {
  const systemPrompt = "你是人生進化 Action 專業客服。嚴格禁止虛構課程。模擬原生資訊流，不加粗、不包框。";
  
  // 優先 4o (較聽話，不亂開頭詢問)
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

  // 備援 Gemini
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

  await replyToLINE(event.replyToken, "系統忙碌中，請點點選單或稍後再試。", null, env);
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
