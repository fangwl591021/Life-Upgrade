// 產生第一層：課程分類輪播卡片 (每一類都有專屬大圖，改為 micro 版型)
export function generateCategoryFlexMessage(categories) {
  if (!categories || categories.length === 0) return null;

  // 定義分類與圖片的對應關係
  const categoryImages = {
    "蛻變階段": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/b8721597914eb3e6352ad3c30e68b153.jpg",
    "完整階段": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/dd11e3a570c5fccccc5fee72f639cfda.jpg",
    "一般": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/25b2916b5c49db617f52fa5ea48efee7.jpg",
    "工作坊": "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c4ca4238a0b923820dcc509a6f75849b.png"
  };

  const bubbles = categories.map(category => {
    const imageUrl = categoryImages[category] || "https://s3.us-west-1.wasabisys.com/aitw/2026/04/c81e728d9d4c2f636f067f89cc14862c.png";

    return {
      type: "bubble",
      size: "micro", // 依照需求改為 micro 版型
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "0px",
        contents: [
          {
            type: "image",
            url: imageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "sm",
            contents: [
              {
                type: "text",
                text: category,
                weight: "bold",
                size: "sm",
                align: "center",
                color: "#333333"
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "xs",
        contents: [
          {
            type: "button",
            action: {
              type: "message",
              label: "查看課程",
              text: `我想查詢 ${category} 的課程`
            },
            style: "primary",
            height: "sm",
            color: "#007AFF"
          }
        ]
      }
    };
  });

  return {
    type: "flex",
    altText: "請選擇感興趣的課程類型",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}

// 產生第二層：課程清單 (旅遊行程卡片樣式)
export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;

  const bubbles = courses.slice(0, 10).map(course => {
    let img = "https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png";
    if (course.imageUrl && course.imageUrl.startsWith("http")) img = course.imageUrl;

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
