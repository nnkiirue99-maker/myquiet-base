const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // --- 强制获取 type ---
    const type = req.query.type;
    if (!type) return res.status(200).json({ error: "No Type Provided" });

    try {
        const databaseId = dbMap[type];
        const response = await notion.databases.query({
            database_id: databaseId,
            sorts: [{ property: 'Date', direction: 'descending' }],
            page_size: 50
        });

        // 打印到 Vercel 日志，帮我们看到 Notion 到底查到了什么
        console.log(`Querying ${type}, found ${response.results.length} pages`);

        const posts = response.results.map(page => {
            const props = page.properties;
            const titleProp = Object.values(props).find(p => p.type === 'title');
            const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
            
            // 如果这里过滤掉了，posts 就会变空
            if (!text.trim()) return null;
            
            return { content: text, date: page.created_time };
        }).filter(p => p !== null);

        return res.status(200).json(posts);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
