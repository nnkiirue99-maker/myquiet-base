import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
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
            sorts: [{ property: 'Date', direction: 'descending' }],
            page_size: 50, 
        });

        const posts = response.results.map(page => {
            const rawDate = page.properties.Date?.date?.start;
            
            // 关键修正：将 Notion 的 UTC 时间转换为东八区时间字符串
            let formattedDate = "";
            if (rawDate) {
                const dateObj = new Date(rawDate);
                formattedDate = new Intl.DateTimeFormat('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }).format(dateObj).replace(/\//g, '-');
            }

            return {
                content: page.properties.Content?.title[0]?.plain_text || "无内容",
                date: formattedDate
            };
        });

        return res.status(200).json({
            posts: posts,
            has_more: response.has_more
        });
    } catch (error) {
        return res.status(500).json({ error: "Notion 读取失败", details: error.message });
    }
}
