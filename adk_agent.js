import { getCourseCategories, getCourseList, createOrder, getUserOrders, getUserProfile } from './google_sheets_handler.js';
import { generateCategoryFlexMessage, generateCourseFlexMessage, generateOrderListFlexMessage } from './message_templates.js';

export async function handleAIRequest(event, env) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId;

  // --- 1. 核心功能攔截器 (最優先，執行後必須立即 return) ---

  // 意圖 A: 查看課程列表
  if (userMessage.includes("看課程") || userMessage.includes("報名") || userMessage.includes("選單") || userMessage.includes("課程")) {
    // 排除特定預約指令格式，避免衝突
    if (!userMessage.includes("我想預約")) {
      const cats = await getCourseCategories(env);
      if (cats && cats.length > 0) {
        return await replyToLINE(event.replyToken, "請選擇您感興趣的課程階段：", generateCategoryFlexMessage(cats), env);
      }
    }
  }

  // 意圖 B: 處理報名預約 (Regex)
  const orderMatch = userMessage.match(/我想預約\s*([\s\S]+?)\s*\([\s\u3000]*編號[\s\u3000]*[:：][\s\u3000]*(.+?)[\s\u3000]*,[\s\u3000]*金額[\s\u3000]*[:：][\s\u3000]*(\d+)[\s\u3000]*\)/);
  if (orderMatch) {
    const courseId = orderMatch[2].trim();
    const amount = parseInt(orderMatch[3]);
    try {
      const profile = await getUserProfile(userId, env);
      if (!profile || !profile.name) {
        // 未註冊則引導至註冊，並立即 return
        return await replyToLINE(event.replyToken, "您尚未完成學員註冊喔！✨\n請先點選選單中的「會員中心」填寫真實姓名與手機，再進行報名，謝謝您的配合。", null, env);
      }

      // 已註冊：將 profile.name 與 profile.phone 寫入 CRM D 欄與 F 欄
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
      // 異常處理仍採用 4o 備援，不使用 Gemini
      return await callOpenAI(event, "預約已受理但卡片生成稍慢，請引導使用者點選「我的預約」查看結果。", env);
    }
  }

  // 意圖 C: 查詢紀錄
  if (userMessage.includes("我的預約") || userMessage.includes("查詢預約") || userMessage.includes("報名紀錄")) {
    const orders = await getUserOrders(userId, env);
    if (orders && orders.length > 0) {
      return await replyToLINE(event.replyToken, "這是您的預約紀錄：", generateOrderListFlexMessage(orders), env);
    }
    return await replyToLINE(event.replyToken, "目前查無預約紀錄喔！", null, env);
  }

  // 意圖 D: 分類細項查詢
  const categoryMatch = userMessage.match(/我想查詢[\s\u3000]*(.+?)[\s\u3000]*的課程/);
  if (categoryMatch) {
    const catName = categoryMatch[1].trim();
    const courses = await getCourseList(catName, env);
    if (courses && courses.length > 0) {
      return await replyToLINE(event.replyToken, "這是「" + catName + "」的最新課程：", generateCourseFlexMessage(courses), env);
    }
  }

  // --- 2. 雙 API 備援機制 (優先使用 GPT-4o) ---
  return await callOpenAI(event, userMessage, env);
}

async function callOpenAI(event, userMessage, env) {
  const systemPrompt = "你是人生進化 Action 專業客服。模擬 LINE 原生資訊流格式，不包框、不加粗。禁止虛構課程，若使用者詢問課程請引導點擊選單。";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + env.OPENAI_API_KEY 
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      })
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {
    // 只有 4o 出錯時才使用 Gemini 作為最後備援
    return await callGemini(event, userMessage, env);
  }
}

async function callGemini(event, userMessage, env) {
  const systemPrompt = "你是人生進化 Action 備援客服。簡短回覆即可。";
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return await replyToLINE(event.replyToken, text, null, env);
  } catch (e) {}
  await replyToLINE(event.replyToken, "系統忙碌中，請稍後再試。", null, env);
}

async function replyToLINE(replyToken, text, flexMessage, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flexMessage) messages.push(flexMessage);
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.LINE_CHANNEL_ACCESS_TOKEN
    },
    body: JSON.stringify({ replyToken: replyToken, messages: messages })
  });
}
