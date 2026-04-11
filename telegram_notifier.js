export async function sendTelegramMessage(text, env) {
  // 將 Token 與 Chat ID 寫死，作為絕對保底
  const botToken = "8744985479:AAGFfK4ze6awhdkWDpKcTSHKO6Ys_uBxPfo";
  const chatId = "-5283526670";

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (error) {
    console.error("TG Error:", error);
  }
}
