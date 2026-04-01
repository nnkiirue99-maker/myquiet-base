const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

module.exports = async (req, res) => {
  const { type } = req.query;

  const databaseIdMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2
  };

  const databaseId = databaseIdMap[type];

  if (!databaseId) {
    return res.status(400).json({ error: "Missing database ID" });
  }

  try {
    const response = await notion.databases.query({
      database_id: databaseId,
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: 50,
    });

    const posts = response.results.map((page) => {
      // 1. 安全提取内容
      const content = page.properties.Content?.title?.[0]?.plain_text || "无内容";
      
      // 2. 强制转换东八区时间
      let formattedDate = "";
      const rawDate = page.properties.Date?.date?.start;
      
      if (rawDate) {
        const d = new Date(rawDate);
        // 强制偏移 8 小时并格式化
        const localDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
        formattedDate = localDate.toISOString().replace('T', ' ').substring(0, 16);
      }

      return {
        content: content,
        date: formattedDate,
      };
    });

    res.status(200).json({
      posts: posts,
      has_more: response.has_more,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Notion Query Failed" });
  }
};
