export function generateCourseFlexMessage(courses) {
  if (!courses || courses.length === 0) return null;

  // 限制最多顯示 10 筆，避免超出 LINE 輪播卡片的數量限制
  const bubbles = courses.slice(0, 10).map(course => {
    
    // LINE Flex 圖片必須是 https 開頭的公開網址，不支援 base64
    // 若無有效網址，則套用預設圖片
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
