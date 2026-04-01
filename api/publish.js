import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
    const { type, page = 1 } = req.query;
    
    // 映射数据库 ID
    const databaseIdMap = {
        'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
        'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
        'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
        'CAT2': process.env.NOTION_DATABASE_ID_CAT2
    };

    const databaseId = databaseIdMap[type];

    if (!databaseId) {
        return res.status(400).json({ error: "Missing database ID for type: " + type });
    }

    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            sorts: [{ property: 'Date', direction: 'descending' }],
            page_size: 50, // 已为你修改为每页 50 条
            // 如果是第 2 页及以后，这里需要处理 start_cursor，
            // 简单起见，目前先确保首屏加载足够多（50条）
        });

        const posts = response.results.map(page => ({
            content: page.properties.Content?.title[0]?.plain_text || "无内容",
            date: page.properties.Date?.date?.start || ""
        }));

        return res.status(200).json({
            posts: posts,
            has_more: response.has_more
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Notion 读取失败", details: error.message });
    }
}
