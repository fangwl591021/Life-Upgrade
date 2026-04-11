import { getCourseCategories, getCourseList, createOrder, getUserOrders } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // 將 API Key 提取至變數管理
  const geminiKey = env.GEMINI_API_KEY;
  const openaiKey = env.OPENAI_API_KEY;

  // 1. 處理預約報名指令 (RegExp)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      await createOrder(userId, courseId, amount, env);
      const orders = await getUserOrders(userId, env);
      return await replyToLINE(event.replyToken, '感謝您的預約！✨ 請點擊下方按鈕完成匯款回報 💳', generateOrderListFlexMessage(orders), env);
    } catch (e) { return await replyToLINE(event.replyToken, '系統忙碌中，請稍後再試。', null, env); }
  }

  // 2. 處理取消預約
  const cancelMatch = userMessage.match(/我想取消報名\s*\(單號\s*[:：]\s*(.+?)\)/);
  if (cancelMatch) {
    const orderId = cancelMatch[1].trim();
    try {
      await fetch(env.APPS_SCRIPT_URL, { 
        method: 'POST', 
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
        body: JSON.stringify({ action: 'cancelOrder', data: { orderId: orderId } })
      });
      return await replyToLINE(event.replyToken, '已成功取消預約。', null, env);
    } catch (e) { return await replyToLINE(event.replyToken, '取消失敗。', null, env); }
  }

  // 3. 查詢紀錄
  if (userMessage.includes('我的預約') || userMessage.includes('我的報名')) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) return await replyToLINE(event.replyToken, '這是您的報名紀錄：', generateOrderListFlexMessage(orders), env);
    return await replyToLINE(event.replyToken, '目前查無紀錄。', null, env);
  }

  // 4. 查看課程選單
  if (userMessage === '我想看課程' || userMessage === '我想報名') {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(event.replyToken, '目前暫無課程開放預約。', null, env);
    return await replyToLINE(event.replyToken, '請選擇課程類型：', generateCategoryFlexMessage(cats), env);
  }

  // 5. 查詢分類
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) return await replyToLINE(event.replyToken, '以下是「' + catName + '」的課程細項：', generateCourseFlexMessage(courses), env);
    return await replyToLINE(event.replyToken, '抱歉，目前找不到開放預約的課程。', null, env);
  }

  // 6. 雙引擎 AI 核心 (Gemini 優先 + OpenAI 備援)
  const systemPrompt = "你是專業課程客服。模擬 LINE OA 原生資訊流格式，不包框、不加粗字、親切簡潔。";
  
  // A. 嘗試首選引擎：Gemini (效益最大化：免費額度優先)
  const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey;
  try {
    const gRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: userMessage }] }], 
        systemInstruction: { parts: [{ text: systemPrompt }] } 
      })
    });
    if (gRes.ok) {
      const gData = await gRes.json();
      const gText = gData.candidates && gData.candidates[0] && gData.candidates[0].content && gData.candidates[0].content.parts && gData.candidates[0].content.parts[0] && gData.candidates[0].content.parts[0].text;
      if (gText) return await replyToLINE(event.replyToken, gText, null, env);
    }
  } catch (err) {
    console.error('Gemini Error, switching to OpenAI...');
  }

  // B. 嘗試備援引擎：OpenAI (付費保障穩定性)
  try {
    const oRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + openaiKey 
      },
      body: JSON.stringify({ 
        model: "gpt-4o", 
        messages: [
          { role: "system", content: systemPrompt }, 
          { role: "user", content: userMessage }
        ] 
      })
    });
    if (oRes.ok) {
      const oData = await oRes.json();
      const oText = oData.choices && oData.choices[0] && oData.choices[0].message && oData.choices[0].message.content;
      if (oText) return await replyToLINE(event.replyToken, oText, null, env);
    }
  } catch (err) {
    console.error('OpenAI Error');
  }

  // C. 最終防線：若雙引擎皆失效回傳罐頭訊息
  await replyToLINE(event.replyToken, "我現在無法思考，請稍後再問我一次，或者點選下方選單查看課程喔！", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = []; 
  if (text) messages.push({ type: 'text', text: text }); 
  if (flexMessage) messages.push(flexMessage);
  
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN 
    },
    body: JSON.stringify({ replyToken: replyToken, messages: messages })
  });
}
