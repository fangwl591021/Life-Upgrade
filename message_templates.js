// 產生第一層：課程分類選項 Flex Message
export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;

  const buttons = categories.map(category => ({
    type: "button",
    action: {
      type: "message",
      label: `✓  ${category}`, // 加上你截圖中的勾勾圖示
      text: `我想查詢 ${category} 的課程` // 隱藏指令
    },
    height: "sm",
    style: "link", // 使用純文字連結，無框線，貼近原生感
    color: "#333333",
    margin: "xs"
  }));

  return {
    type: "flex",
    altText: "請選擇課程類型",
    contents: {
      type: "bubble",
      size: "kilo", // 保持窄版不佔版面
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
            align: "center"
          },
          {
            type: "separator",
            margin: "md"
          },
          ...buttons
        ]
      }
    }
  };
}

// 產生第二層：實際課程細項 Flex Message (維持上一版的極簡設定)
export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;

  const bubbles = courses.slice(0, 10).map(course => {
    let validImageUrl = "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
    if (course.imageUrl && course.imageUrl.toString().startsWith("https://")) {
      validImageUrl = course.imageUrl;
    }

    return {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "image",
            url: validImageUrl,
            size: "full",
            aspectRatio: "20:13"
          },
          {
            type: "text",
            text: course.name || "未命名課程",
            weight: "bold",
            size: "sm",
            wrap: true,
            align: "center"
          },
          {
            type: "text",
            text: course.description || `價格: NT$ ${course.price}`,
            wrap: true,
            offsetStart: "5px"
          }
        ],
        spacing: "sm",
        paddingAll: "0px"
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: {
              type: "message",
              label: "我要報名",
              text: `我想預約 ${course.name}`
            },
            height: "sm",
            style: "primary"
          }
        ]
      }
    };
  });

  return {
    type: "flex",
    altText: "課程清單已送達，請於手機查看",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}
