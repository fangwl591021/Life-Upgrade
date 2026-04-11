export function generateOrderListFlexMessage(orders) {
  if (!orders || orders.length === 0) return null;
  const bubbles = orders.map(order => ({
    type: "bubble", size: "kilo",
    body: { type: "box", layout: "vertical", spacing: "md", contents: [
      { type: "text", text: "報名資訊確認", size: "lg", color: "#1DB446" },
      { type: "separator" },
      { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: order.courseName, size: "md", wrap: true, color: "#1e293b" },
        { type: "text", text: "預約單號: " + order.orderId, size: "sm", color: "#64748b" },
        { type: "text", text: "預約金額: NT$ " + order.amount, size: "lg", color: "#ef4444" },
        { type: "text", text: "處理狀態: " + order.status, size: "md", color: "#1e293b" }
      ]}
    ]},
    footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
      { type: "button", action: { type: "uri", label: "回報匯款", uri: "https://liff.line.me/2009130603-sXSzvlh2?orderId=" + order.orderId }, style: "primary", height: "md", color: "#1DB446" },
      { type: "button", action: { type: "message", label: "取消報名", text: "我想取消報名 (單號:" + order.orderId + ")" }, style: "secondary", height: "md" }
    ]}
  }));
  return { type: "flex", altText: "您的預約紀錄", contents: { type: "carousel", contents: bubbles } };
}

export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;
  const bubbles = categories.map(category => ({
    type: "bubble", size: "micro",
    body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [
      { type: "image", url: "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c81e728d9d4c2f636f067f89cc14862c.png", size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      { type: "box", layout: "vertical", paddingAll: "sm", contents: [{ type: "text", text: category, size: "md", align: "center", color: "#1e293b" }]}
    ]},
    footer: { type: "box", layout: "vertical", paddingAll: "xs", contents: [
      { type: "button", action: { type: "message", label: "查看課程", text: "我想查詢 " + category + " 的課程" }, style: "primary", height: "sm", color: "#007AFF" }
    ]}
  }));
  return { type: "flex", altText: "選擇課程類型", contents: { type: "carousel", contents: bubbles } };
}

export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;
  const bubbles = courses.slice(0, 10).map(course => ({
    type: "bubble", size: "mega",
    body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [
      { type: "image", url: course.imageUrl || "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png", size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      { type: "box", layout: "vertical", paddingAll: "lg", spacing: "sm", contents: [
        { type: "text", text: course.name, size: "lg", color: "#1e293b", wrap: true },
        { type: "text", text: (course.description || ""), size: "sm", color: "#64748b", wrap: true, maxLines: 5 },
        { type: "text", text: "NT $" + course.price + " 起", color: "#ef4444", size: "xl", align: "end", margin: "md" }
      ]}
    ]},
    footer: { type: "box", layout: "vertical", spacing: "md", contents: [
      { type: "separator" },
      { type: "box", layout: "horizontal", spacing: "md", contents: [
        { type: "button", action: { type: "uri", label: "詳情", uri: "https://liff.line.me/2009130603-sXSzvlh2?id=" + course.id }, style: "link", height: "sm" },
        { type: "button", action: { type: "message", label: "預約報名", text: "我想預約 " + course.name + " (編號:" + course.id + ", 金額:" + course.price + ")" }, style: "primary", height: "md", color: "#007AFF" }
      ]}
    ]}
  }));
  return { type: "flex", altText: "人生進化 Action 精選課程", contents: { type: "carousel", contents: bubbles } };
}
