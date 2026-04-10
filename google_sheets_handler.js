export async function getCourseCategories(env) {
  try {
    const response = await fetch(`${env.APPS_SCRIPT_URL}?action=getCourseCategories`, {
      method: 'GET'
    });
    const result = await response.json();
    return result.data || [];
  } catch (e) {
    console.error('getCourseCategories Error:', e);
    return [];
  }
}

// 支援傳入 category 來篩選課程
export async function getCourseList(category, env) {
  try {
    const url = category 
      ? `${env.APPS_SCRIPT_URL}?action=getCourseList&category=${encodeURIComponent(category)}`
      : `${env.APPS_SCRIPT_URL}?action=getCourseList`;
      
    const response = await fetch(url, { method: 'GET' });
    const result = await response.json();
    return result.data || [];
  } catch (e) {
    console.error('getCourseList Error:', e);
    return [];
  }
}

export async function updateCustomerProfile(userData, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateCustomer', data: userData })
    });
  } catch (e) { console.error('updateCustomerProfile Error:', e); }
}

export async function createOrder(lineUid, courseId, amount, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createOrder',
        data: { lineUid, courseId, amount, timestamp: new Date().toISOString() }
      })
    });
  } catch (e) { console.error('createOrder Error:', e); }
}
