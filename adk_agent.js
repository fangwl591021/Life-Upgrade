import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  const geminiKey = env.GEMINI_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;

  // 1. 處理報名預約指令
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    
    try {
      // 核心邏輯：報名前先檢查註冊狀態
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        // 未註冊，引導至註冊頁面 (此處假設有註冊 LIFF，否則提示文字)
        return await replyToLINE(event.replyToken, "您尚未完成學員註冊喔！✨\n請先點選選單中的「會員中心」完成資料填寫，再進行課程預約，謝謝您的配合。", null, env);
      }

      // 已註冊，帶入姓名與電話寫入訂單
      await createOrder({
        lineUid: userId,
        userName: profile.name,
        userPhone: profile.phone,
        courseId: courseId,
        amount: amount
      }, env);

      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, "感謝您的預約！✨ 請點擊下方按鈕完成匯款回報。", generateOrderListFlexMessage(orders), env);
    } catch (e) { return await replyToLINE(event.replyToken, "系統忙碌中，請稍後再試。", null, env); }
  }

  // 2. 取消報名
  const cancelMatch = userMessage.match(/我想取消報名\s*\(單號\s*[:：]\s*(.+?)\)/);
  if (cancelMatch) {
    const orderId = cancelMatch[1].trim();
    try {
      await fetch(env.APPS_SCRIPT_URL, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "cancelOrder", data: { orderId: orderId } }) });
      return await replyToLINE(event.replyToken, "預約已成功取消。", null, env);
    } catch (e) { return await replyToLINE(event.replyToken, "取消失敗，請聯絡客服。", null, env); }
  }

  // 3. 查詢紀錄
  if (userMessage.includes("我的預約") || userMessage.includes("我的報名")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, "以下是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // 4. 查看課程選單
  if (userMessage === "我想看課程" || userMessage === "我想報名") {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(event.replyToken, "目前暫無課程開放預約。", null, env);
    return await replyToLINE(event.replyToken, "請選擇您感興趣的課程類型：", generateCategoryFlexMessage(cats), env);
  }

  // 5. 分類課程查詢
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) return await replyToLINE(event.replyToken, "這是「" + catName + "」的課程細項：", generateCourseFlexMessage(courses), env);
    return await replyToLINE(event.replyToken, "抱歉，目前找不到該類別的課程。", null, env);
  }

  // 6. AI 客服
  const systemPrompt = "你是人生進化 Action 專業客服。模擬 LINE 原生資訊流格式，不包框、不加粗、親切。";
  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey;
  try {
    const gRes = await fetch(geminiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: userMessage }] }], systemInstruction: { parts: [{ text: systemPrompt }] } }) });
    if (gRes.ok) {
      const gData = await gRes.json();
      const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (gText) return await replyToLINE(event.replyToken, gText, null, env);
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
