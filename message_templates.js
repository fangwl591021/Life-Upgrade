export function generateCourseFlexMessage(courses) {
  const bubbles = courses.map(course => ({
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: course.name,
          weight: "bold",
          size: "xl"
        },
        {
          type: "text",
          text: `價格: NT$ ${course.price}`,
          size: "md",
          color: "#888888"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          action: {
            type: "message",
            label: "我要預約",
            text: `我想預約 ${course.name}`
          }
        }
      ]
    }
  }));

  return {
    type: "flex",
    altText: "課程列表",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}
