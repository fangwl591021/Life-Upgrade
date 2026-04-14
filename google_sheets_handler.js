/**
 * 人生進化 Action - Google Sheets 資料對接模組
 * 確保所有導出函數與 adk_agent.js 匹配
 */

export async function getCourseCategories(env) {
  try {
    const res = await fetch(`${env.APPS_SCRIPT_URL}?action=getCourseCategories`, { redirect: "follow" });
    const json = await res.json();
    return json.data || [];
  } catch (e) {
    return [];
  }
}

export async function getCourseList(category, env) {
  try {
    const url = `${env.APPS_SCRIPT_URL}?action=getCourseList&category=${encodeURIComponent(category)}`;
    const res = await fetch(url, { redirect: "follow" });
    const json = await res.json();
    return json.data || [];
  } catch (e) {
    return [];
  }
}

export async function getUserOrders(lineUid, env) {
  try {
    const url = `${env.APPS_SCRIPT_URL}?action=getUserOrders&lineUid=${lineUid}`;
    const res = await fetch(url, { redirect: "follow" });
    const json = await res.json();
    return json.data || [];
  } catch (e) {
    return [];
  }
}

export async function getUserProfile(lineUid, env) {
  try {
    const url = `${env.APPS_SCRIPT_URL}?action=getUserProfile&lineUid=${lineUid}`;
    const res = await fetch(url, { redirect: "follow" });
    const json = await res.json();
    return json.data || null;
  } catch (e) {
    return null;
  }
}

export async function createOrder(data, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createOrder", data })
    });
  } catch (e) {}
}

// 【修復】補上遺失的 cancelOrder 導出
export async function cancelOrder(data, env) {
  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancelOrder", data })
    });
    return await res.json();
  } catch (e) {
    return { status: "error", message: "連線逾時" };
  }
}
