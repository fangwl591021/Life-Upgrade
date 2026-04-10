// 產生第一層：課程分類選項 Flex Message (帶圖片與圓角按鈕版)
export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;

  // 建立分類按鈕陣列
  const buttons = categories.map(category => ({
    type: "button",
    action: {
      type: "message",
      label: category,
      text: `我想查詢 ${category} 的課程`
    },
    style: "secondary", // 使用次要按鈕樣式，視覺較柔和
    height: "sm",
    margin: "md",
    color: "#F0F0F0", // 淺灰色底
    cornerRadius: "md" // 圓角設定
  }));

  return {
    type: "flex",
    altText: "請選擇課程類型",
    contents: {
      type: "bubble",
      size: "kilo", // 保持窄版，視覺較精緻
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c81e728d9d4c2f636f067f89cc14862c.png",
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          }
        ],
        paddingAll: "0px"
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "lg",
        contents: [
          {
            type: "text",
            text: "請選擇階段 / 類型",
            weight: "bold",
            size: "sm",
            color: "#666666",
            align: "center",
            margin: "none"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            contents: buttons
          }
        ]
      }
    }
  };
}

// 產生第二層：實際課程細項 Flex Message (維持雙按鈕極簡設定)
export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;

  const bubbles = courses.slice(0, 10).map(course => {
    let img = "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
    if (course.imageUrl && course.imageUrl.startsWith("http")) img = course.imageUrl;

    const detailAction = (course.liffUrl && course.liffUrl.startsWith("http")) 
      ? { type: "uri", label: "課程說明", uri: course.liffUrl }
      : { type: "message", label: "課程說明", text: `${course.name} 暫無線上說明。` };

    return {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        contents: [
          { type: "image", url: img, size: "full", aspectRatio: "20:13" },
          { type: "text", text: course.name, weight: "bold", size: "sm", align: "center", margin: "md" },
          { 
            type: "text", 
            text: course.description || `價格: ${course.price}`, 
            wrap: true, 
            margin: "md", 
            size: "xs", 
            offsetStart: "5px",
            color: "#666666"
          }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "sm",
        contents: [
          { 
            type: "button", 
            action: detailAction, 
            style: "secondary",
            height: "sm" 
          },
          { 
            type: "button", 
            action: { 
              type: "message", 
              label: "我要報名", 
              text: `我想預約 ${course.name} (編號:${course.id}, 金額:${course.price})` 
            }, 
            style: "primary", 
            height: "sm" 
          }
        ]
      }
    };
  });

  return { type: "flex", altText: "課程清單", contents: { type: "carousel", contents: bubbles } };
}
