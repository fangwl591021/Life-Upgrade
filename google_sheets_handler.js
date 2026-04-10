export async function getCourseList(env) {
  try {
    const response = await fetch(`${env.APPS_SCRIPT_URL}?action=getCourseList`, {
      method: 'GET'
    });
    const result = await response.json();
    return result.data || [
      { id: 'C001', name: 'AI行銷實作班', price: 3000 }
    ];
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
      body: JSON.stringify({
        action: 'updateCustomer',
        data: userData
      })
    });
  } catch (e) {
    console.error('updateCustomerProfile Error:', e);
  }
}

export async function createOrder(lineUid, courseId, amount, env) {
  try {
    await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createOrder',
        data: {
          lineUid: lineUid,
          courseId: courseId,
          amount: amount,
          timestamp: new Date().toISOString()
        }
      })
    });
  } catch (e) {
    console.error('createOrder Error:', e);
  }
}
