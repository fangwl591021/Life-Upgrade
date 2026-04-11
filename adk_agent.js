import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  const geminiKey = env.GEMINI_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;

  // 1. 識別報名預約意圖 (精準識別，解決 AI 幻覺)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      // 核心邏輯：報名檢查
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        return await replyToLINE(event.replyToken, "您尚未完成學員註冊喔！✨\n請點選選單中的「會員中心」填寫真實姓名與手機，再進行報名，謝謝您的配合。", null, env);
      }

      await createOrder({
        lineUid: userId,
        userName: profile.name,
        userPhone: profile.phone,
        courseId: courseId,
        amount: amount
      }, env);

      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) { return await replyToLINE(event.replyToken, "預約系統忙碌中，請稍後再試。", null, env); }
  }

  // 2. 識別分類查詢意圖 (杜絕虛假資料)
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, "這是「" + catName + "」的最新課程細項：", generateCourseFlexMessage(courses), env);
    } else {
      return await replyToLINE(event.replyToken, "抱歉，目前該分類下找不到開放預約的課程。", null, env);
    }
  }

  // 3. 通用選單功能
  if (userMessage === "我想看課程" || userMessage === "我想報名") {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(event.replyToken, "目前暫無課程開放預約。", null, env);
    return await replyToLINE(event.replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  if (userMessage.includes("我的預約") || userMessage.includes("我的報名")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "這是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // 4. AI 雙引擎回應 (僅處理閒聊，禁止虛構課程)
  const systemPrompt = "你是人生進化 Action 專業客服。嚴格禁止虛構課程。只能引導使用者點擊選單查詢課程。格式簡潔親切，不加粗，不包框。";
  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey;
  try {
    const gRes = await fetch(geminiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: userMessage }] }], systemInstruction: { parts: [{ text: systemPrompt }] } }) });
    if (gRes.ok) {
      const gData = await gRes.json();
      const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (gText) return await replyToLINE(event.replyToken, gText, null, env);
    }
  } catch (err) {}

  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + openaiKey }, body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }] }) });
    if (oRes.ok) {
      const oData = await oRes.json();
      const oText = oData.choices?.[0]?.message?.content;
      if (oText) return await replyToLINE(event.replyToken, oText, null, env);
    }
  } catch (err) {}

  await replyToLINE(event.replyToken, "我現在無法思考，請稍後再試。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = []; if (text) messages.push({ type: "text", text: text }); if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ replyToken: replyToken, messages: messages })
  });
}
