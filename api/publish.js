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
      sorts: [
        {
          property: "Date",
          direction: "descending",
        },
      ],
      page_size: 50,
    });

    const posts = response.results.map((page) => ({
      content: page.properties.Content.title[0].plain_text,
      date: page.properties.Date.date.start,
    }));

    res.status(200).json({
      posts: posts,
      has_more: response.has_more,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
