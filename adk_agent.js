/**
 * 人生進化 Action - 核心大腦 (adk_agent.js)
 * 升級：GPT-4o 語義大腦 + 視覺模組內建 (徹底解決 Build Failed)
 * 核心：111 測試、WP 路由過濾、硬攔截指令
 */
import { getCourseCategories, getCourseList } from './google_sheets_handler.js';

// 【WP 專屬關鍵字】遇到這些詞，AI 會保持沉默，交給 WP (8404) 處理
const WP_EXCLUSIVE_COMMANDS = ["會員專區", "登入", "註冊", "綁定", "我的帳號", "測試", "Little Sweetness"];

export async function handleAIRequest(event, env) {
  const rawMessage = (event.message.text || "").trim();
  const cleanMsg = rawMessage.replace(/[\s\u3000]/g, "");
  const replyToken = event.replyToken;

  // 1. 【路由過濾】WP 指令攔截：絕對沉默
  if (WP_EXCLUSIVE_COMMANDS.some(cmd => cleanMsg.includes(cmd))) {
    console.log("Detect WP command, AI keep silent.");
    return; 
  }

  // 2. 【硬攔截指令】最高優先權，反應最快，不進 AI
  
  // 指令 111：用戶要求非 WP 回應測試
  if (cleanMsg === "111") {
    return await replyToLINE(replyToken, "想了解哪種課程", null, env);
  }

  // 系統診斷指令
  if (cleanMsg === "檢測") {
    try {
      const start = Date.now();
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "ping" }], max_tokens: 5 })
      });
      const aiStatus = res.ok ? "🟢 GPT-4o 正常" : `🔴 AI 異常 (${res.status})`;
      const cats = await getCourseCategories(env);
      const gasStatus = (cats && cats.length > 0) ? `🟢 GAS 正常 (${cats.length}筆)` : "🔴 GAS 無資料";
      
      return await replyToLINE(replyToken, `【系統診斷】\n大腦：${aiStatus}\n資料：${gasStatus}\n耗時：${Date.now() - start}ms`, null, env);
    } catch (e) {
      return await replyToLINE(replyToken, `❌ 診斷失敗：${e.message}`, null, env);
    }
  }

  // 指令 9 (選單)
  if (cleanMsg === "9" || cleanMsg === "選單") {
    const cats = await getCourseCategories(env);
    if (!cats || cats.length === 0) return await replyToLINE(replyToken, "⚠️ 無法讀取分類，請檢查試算表 M 欄。", null, env);
    return await replyToLINE(replyToken, null, renderGigaMenu(cats), env);
  }

  // 3. 【GPT-4o 語義大腦層】
  try {
    const systemPrompt = `你是一個專業課程助理。請解析訊息意圖，並嚴格只回傳 JSON：{"intent":"SHOW_MENU"|"QUERY_COURSE"|"CHAT", "keyword":"分類", "replyText":"回應內容"}`;
    
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: rawMessage }],
        response_format: { type: "json_object" }
      })
    });

    const data = await aiRes.json();
    const intent = JSON.parse(data.choices[0].message.content);

    if (intent.intent === "SHOW_MENU") {
      const cats = await getCourseCategories(env);
      return await replyToLINE(replyToken, null, renderGigaMenu(cats), env);
    }

    if (intent.intent === "QUERY_COURSE" && intent.keyword) {
      const courses = await getCourseList(intent.keyword, env);
      if (courses.length > 0) return await replyToLINE(replyToken, `為您找到「${intent.keyword}」課程：`, renderCourseCarousel(courses), env);
      return await replyToLINE(replyToken, `目前找不到「${intent.keyword}」的課程。`, null, env);
    }

    return await replyToLINE(replyToken, intent.replyText || "您好！輸入 9 查看選單。", null, env);

  } catch (err) {
    return await replyToLINE(replyToken, "助理正在整理思緒，請輸入「9」開啟選單。", null, env);
  }
}

/**
 * 【內建視覺模組】直接定義在檔案內，徹底排除 Import Error
 */
function renderGigaMenu(categories) {
  const items = (categories || []).slice(0, 10).map(cat => ({
    type: "action",
    action: { type: "message", label: cat, text: `我想看 ${cat} 的課程` }
  }));
  return {
    type: "flex",
    altText: "最新課程選單",
    contents: {
      type: "bubble", size: "giga",
      body: {
        type: "box", layout: "vertical", paddingAll: "0px",
        contents: [{
          type: "image", url: "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c4ca4238a0b923820dcc509a6f75849b.png",
          size: "full", aspectMode: "cover", aspectRatio: "20:13"
        }]
      }
    },
    quickReply: { items: items.length > 0 ? items : [{ type: "action", action: { type: "message", label: "看課程", text: "9" } }] }
  };
}

function renderCourseCarousel(courses) {
  return {
    type: "flex",
    altText: "課程清單",
    contents: {
      type: "carousel",
      contents: courses.slice(0, 10).map(p => ({
        type: "bubble", size: "micro",
        hero: {
          type: "image", url: p.imageUrl || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=500",
          size: "full", aspectMode: "cover", aspectRatio: "4:3"
        },
        body: {
          type: "box", layout: "vertical", paddingAll: "10px",
          contents: [
            { type: "text", text: p.name, size: "sm", wrap: true, weight: "bold" },
            { type: "text", text: `NT$ ${p.price}`, size: "xs", color: "#d4111e" }
          ]
        }
      }))
    }
  };
}

async function replyToLINE(replyToken, text, flex, env) {
  const messages = [];
  if (text) messages.push({ type: "text", text: text });
  if (flex) messages.push(flex);
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages })
  });
}
