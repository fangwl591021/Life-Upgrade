export function generateOrderListFlexMessage(orders) {
  if (!orders || orders.length === 0) return null;
  const bubbles = orders.map(order => ({
    type: "bubble", size: "kilo",
    body: { type: "box", layout: "vertical", spacing: "md", contents: [
      { type: "text", text: "報名資訊確認", weight: "bold", size: "lg", color: "#1DB446" },
      { type: "separator" },
      { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: order.courseName, weight: "bold", size: "lg", wrap: true, color: "#000000" },
        { type: "text", text: `訂單編號: \${order.orderId}`, size: "md", color: "#000000" },
        { type: "text", text: `應付金額: NT$ \${order.amount}`, size: "xl", color: "#FF0000", weight: "bold" },
        { type: "text", text: `目前狀態: \${order.status}`, size: "lg", weight: "bold", color: "#000000" }
      ]},
      { type: "box", layout: "vertical", backgroundColor: "#f0f0f0", paddingAll: "lg", cornerRadius: "md", contents: [
        { type: "text", text: "匯款帳戶：(822) 中國信託", size: "md", color: "#000000", weight: "bold" },
        { type: "text", text: "帳號：123-45678-9012", size: "md", color: "#000000", weight: "bold", margin: "xs" },
        { type: "text", text: "匯款後請點擊下方按鈕回報", size: "md", color: "#000000", margin: "sm" }
      ]}
    ]},
    footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
      { type: "button", action: { type: "uri", label: "回報匯款", uri: \`https://liff.line.me/2009130603-ktCTGk6d?orderId=\${order.orderId}\` }, style: "primary", height: "md", color: "#1DB446" },
      { type: "button", action: { type: "message", label: "取消報名", text: \`我想取消報名 (單號:\${order.orderId})\` }, style: "secondary", height: "md" }
    ]}
  }));
  return { type: "flex", altText: "您的報名預約紀錄", contents: { type: "carousel", contents: bubbles } };
}

export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;
  const categoryImages = {
    "蛻變階段": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/b8721597914eb3e6352ad3c30e68b153.jpg",
    "完整階段": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/dd11e3a570c5fccccc5fee72f639cfda.jpg",
    "一般課程": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/25b2916b5c49db617f52fa5ea48efee7.jpg",
    "工作坊課程": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c4ca4238a0b923820dcc509a6f75849b.png"
  };
  const bubbles = categories.map(category => ({
    type: "bubble", size: "micro",
    body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [
      { type: "image", url: categoryImages[category] || "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c81e728d9d4c2f636f067f89cc14862c.png", size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      { type: "box", layout: "vertical", paddingAll: "sm", contents: [{ type: "text", text: category, weight: "bold", size: "md", align: "center", color: "#000000" }]}
    ]},
    footer: { type: "box", layout: "vertical", paddingAll: "xs", contents: [
      { type: "button", action: { type: "message", label: "查看課程", text: \`我想查詢 \${category} 的課程\` }, style: "primary", height: "sm", color: "#007AFF" }
    ]}
  }));
  return { type: "flex", altText: "請選擇感興趣的課程類型", contents: { type: "carousel", contents: bubbles } };
}

export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;
  const bubbles = courses.slice(0, 10).map(course => ({
    type: "bubble", size: "mega",
    body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [
      { type: "image", url: course.imageUrl || "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png", size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      { type: "box", layout: "vertical", paddingAll: "lg", spacing: "sm", contents: [
        { type: "text", text: course.name, weight: "bold", size: "xl", color: "#000000", wrap: true },
        { type: "text", text: course.description || "", size: "md", color: "#333333", wrap: true, maxLines: 5 },
        { type: "text", text: \`NT $\${course.price}起\`, color: "#FF0000", weight: "bold", size: "xxl", align: "end", margin: "md" }
      ]}
    ]},
    footer: { type: "box", layout: "vertical", spacing: "md", contents: [
      { type: "separator" },
      { type: "box", layout: "horizontal", spacing: "md", contents: [
        { type: "button", action: { type: "uri", label: "課程說明 >", uri: \`https://liff.line.me/2009130603-ktCTGk6d?id=\${course.id}\` }, style: "link", height: "sm" },
        { type: "button", action: { type: "message", label: "我要報名", text: \`我想預約 \${course.name} (編號:\${course.id}, 金額:\${course.price})\` }, style: "primary", height: "md", color: "#007AFF" }
      ]}
    ]}
  }));
  return { type: "flex", altText: "為您挑選的課程清單", contents: { type: "carousel", contents: bubbles } };
}
