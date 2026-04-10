// 產生第一層：課程分類選項 Flex Message (帶圖片與圓角按鈕版)
export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;

  const categoryBoxes = categories.map(category => ({
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "text",
        text: `✓  ${category}`,
        align: "center",
        color: "#333333",
        size: "sm"
      }
    ],
    backgroundColor: "#F0F0F0",
    cornerRadius: "md",
    paddingAll: "md",
    margin: "md",
    action: {
      type: "message",
      label: category,
      text: `我想查詢 ${category} 的課程`
    }
  }));

  return {
    type: "flex",
    altText: "請選擇課程類型",
    contents: {
      type: "bubble",
      size: "kilo",
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
            align: "center"
          },
          ...categoryBoxes
        ]
      }
    }
  };
}

// 產生第二層：課程清單 (復刻旅遊行程卡片樣式)
export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;

  const bubbles = courses.slice(0, 10).map(course => {
    let img = "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
    if (course.imageUrl && course.imageUrl.startsWith("http")) img = course.imageUrl;

    // 使用你提供的 LIFF URL 並夾帶課程 ID
    const liffBaseUrl = "https://liff.line.me/2009130603-ktCTGk6d";
    const detailUri = `${liffBaseUrl}?id=${course.id}`;

    return {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        contents: [
          {
            type: "image",
            url: img,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: course.name,
                weight: "bold",
                size: "xl",
                wrap: true
              },
              {
                type: "text",
                text: course.description || "暫無簡介",
                size: "sm",
                color: "#666666",
                wrap: true,
                maxLines: 5 
              },
              {
                type: "text",
                text: `NT $${course.price}起`,
                color: "#FF0000", 
                align: "end",
                weight: "bold",
                size: "lg",
                margin: "md"
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "separator" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "button",
                action: {
                  type: "uri",
                  label: "課程說明 >",
                  uri: detailUri
                },
                style: "link",
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
                height: "sm",
                color: "#007AFF"
              }
            ]
          }
        ]
      }
    };
  });

  return {
    type: "flex",
    altText: "為您挑選的課程清單",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}
