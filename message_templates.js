export function generateOrderListFlexMessage(orders) {
  if (!orders || orders.length === 0) return null;
  const bubbles = orders.map(order => ({
    type: "bubble", size: "kilo",
    body: { type: "box", layout: "vertical", spacing: "md", contents: [
      { type: "text", text: "報名資訊確認", weight: "bold", size: "md", color: "#1DB446" },
      { type: "separator" },
      { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: order.courseName, weight: "bold", size: "sm", wrap: true, color: "#000000" },
        { type: "text", text: `單號: ${order.orderId}`, size: "xs", color: "#000000" },
        { type: "text", text: `應付: NT$ ${order.amount}`, size: "sm", color: "#FF0000", weight: "bold" },
        { type: "text", text: `狀態: ${order.status}`, size: "sm", weight: "bold", color: "#000000" }
      ]},
      { type: "box", layout: "vertical", backgroundColor: "#f0f0f0", paddingAll: "md", cornerRadius: "sm", contents: [
        { type: "text", text: "匯款：(822) 中國信託 123-45678-9012", size: "xs", color: "#000000" }
      ]}
    ]},
    footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
      { type: "button", action: { type: "uri", label: "回報匯款", uri: `https://liff.line.me/2009130603-ktCTGk6d?orderId=${order.orderId}` }, style: "primary", height: "sm", color: "#1DB446" },
      { type: "button", action: { type: "message", label: "取消報名", text: `我想取消報名 (單號:${order.orderId})` }, style: "secondary", height: "sm" }
    ]}
  }));
  return { type: "flex", altText: "您的報名紀錄", contents: { type: "carousel", contents: bubbles } };
}
export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;
  const bubbles = categories.map(category => ({
    type: "bubble", size: "micro",
    body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [{ type: "box", layout: "vertical", paddingAll: "sm", contents: [{ type: "text", text: category, weight: "bold", size: "sm", align: "center", color: "#000000" }]}]},
    footer: { type: "box", layout: "vertical", paddingAll: "xs", contents: [{ type: "button", action: { type: "message", label: "查看", text: `我想查詢 ${category} 的課程` }, style: "primary", height: "sm", color: "#007AFF" }]}
  }));
  return { type: "flex", altText: "課程類型", contents: { type: "carousel", contents: bubbles } };
}
export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;
  const bubbles = courses.slice(0, 10).map(course => ({
    type: "bubble", size: "mega",
    body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [
      { type: "image", url: course.imageUrl || "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png", size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      { type: "box", layout: "vertical", paddingAll: "lg", contents: [
        { type: "text", text: course.name, weight: "bold", size: "xl", color: "#000000" },
        { type: "text", text: `NT $${course.price}起`, color: "#FF0000", weight: "bold", size: "lg" }
      ]}
    ]},
    footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
      { type: "button", action: { type: "uri", label: "說明", uri: `https://liff.line.me/2009130603-ktCTGk6d?id=${course.id}` }, style: "link" },
      { type: "button", action: { type: "message", label: "預約", text: `我想預約 ${course.name} (編號:${course.id}, 金額:${course.price})` }, style: "primary", color: "#007AFF" }
    ]}
  }));
  return { type: "flex", altText: "課程清單", contents: { type: "carousel", contents: bubbles } };
}
