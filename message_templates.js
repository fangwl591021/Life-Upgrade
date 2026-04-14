/**
 * LINE Flex Message 範本庫 - 找回成功流程的視覺核心
 */
export function generateCategoryFlexMessage(categories) {
  return {
    type: "flex",
    altText: "請選擇課程階段",
    contents: {
      type: "carousel",
      contents: categories.map(cat => ({
        type: "bubble",
        size: "micro",
        body: {
          type: "box",
          layout: "vertical",
          contents: [{ type: "text", text: cat, weight: "bold", size: "md", align: "center", color: "#111111" }],
          paddingAll: "20px"
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [{
            type: "button",
            action: { type: "message", label: "查看課程", text: "我想查詢 " + cat + " 的課程" },
            style: "primary",
            color: "#1DB446",
            height: "sm"
          }]
        }
      }))
    }
  };
}

export function generateCourseFlexMessage(courses) {
  return {
    type: "flex",
    altText: "精選課程列表",
    contents: {
      type: "carousel",
      contents: courses.slice(0, 10).map(c => ({
        type: "bubble",
        size: "small",
        hero: { type: "image", url: c.imageUrl || "https://via.placeholder.com/300x200", size: "full", aspectMode: "cover", aspectRatio: "1.5:1" },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: c.name, weight: "bold", size: "md", wrap: true },
            { type: "text", text: "$" + c.price, weight: "bold", size: "lg", color: "#E63946", margin: "md" }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [{
            type: "button",
            action: { type: "message", label: "立即預約", text: "我想預約 " + c.name + " (編號:" + c.id + ", 金額:" + c.price + ")" },
            style: "primary",
            color: "#007AFF"
          }]
        }
      }))
    }
  };
}

export function generateOrderListFlexMessage(orders) {
  return {
    type: "flex",
    altText: "您的預約紀錄",
    contents: {
      type: "carousel",
      contents: orders.slice(0, 5).map(o => ({
        type: "bubble",
        size: "small",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "單號: " + o.orderId, size: "xs", color: "#aaaaaa" },
            { type: "text", text: o.courseName, weight: "bold", size: "md", margin: "sm", wrap: true },
            { type: "text", text: "金額: $" + o.amount, size: "sm", margin: "xs" },
            { type: "text", text: "狀態: " + o.status, weight: "bold", size: "sm", color: o.status === "已確認" ? "#1DB446" : "#F59E0B", margin: "sm" }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              action: { type: "uri", label: "回報匯款", uri: "https://lifeupgrade.fangwl591021.workers.dev/pay?orderId=" + o.orderId },
              style: "primary",
              color: "#1DB446",
              height: "sm",
              displayMode: o.status === "待匯款" ? "flex" : "none"
            },
            {
              type: "button",
              action: { type: "message", label: "取消預約", text: "我想取消報名 (單號:" + o.orderId + ")" },
              style: "secondary",
              height: "sm",
              displayMode: o.status === "待匯款" ? "flex" : "none"
            }
          ]
        }
      }))
    }
  };
}
