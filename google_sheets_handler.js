export async function getCourseCategories(env) {
  try {
    const res = await fetch(`${env.APPS_SCRIPT_URL}?action=getCourseCategories`);
    const json = await res.json();
    return json.data || [];
  } catch (e) { return []; }
}

export async function getCourseList(category, env) {
  try {
    const url = `${env.APPS_SCRIPT_URL}?action=getCourseList&category=${encodeURIComponent(category)}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || [];
  } catch (e) { return []; }
}

export async function getUserOrders(lineUid, env) {
  try {
    const url = `${env.APPS_SCRIPT_URL}?action=getUserOrders&lineUid=${lineUid}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || [];
  } catch (e) { return []; }
}

// 補上這個遺漏的關鍵函式，Worker 就不會再當機了！
export async function getUserProfile(lineUid, env) {
  try {
    const url = `${env.APPS_SCRIPT_URL}?action=getUserProfile&lineUid=${lineUid}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || null;
  } catch (e) { return null; }
}

export async function createOrder(lineUid, courseId, amount, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createOrder', data: { lineUid, courseId, amount } })
    });
  } catch (e) {}
}

export async function cancelOrder(orderId, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancelOrder', data: { orderId } })
    });
  } catch (e) {}
}

export async function reportPayment(orderId, last5, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reportPayment', data: { orderId, last5 } })
    });
  } catch (e) {}
}
