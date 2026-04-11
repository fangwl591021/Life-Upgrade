export async function sendTelegramMessage(text, env) {
  // 直接將 Token 與 Chat ID 寫死作為保底，確保不管環境變數有沒有抓到，都100%發得出去
  const botToken = (env && env.TELEGRAM_BOT_TOKEN) ? env.TELEGRAM_BOT_TOKEN : "8744985479:AAGFfK4ze6awhdkWDpKcTSHKO6Ys_uBxPfo";
  const chatId = (env && env.TELEGRAM_CHAT_ID) ? env.TELEGRAM_CHAT_ID : "-5283526670";

  if (!botToken || !chatId) return;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (error) {
    console.error('Telegram notification failed:', error);
  }
}
