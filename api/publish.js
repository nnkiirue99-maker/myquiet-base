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
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const type = req.method === 'POST' ? req.body.type : req.query.type;
    const databaseId = dbMap[type];

    if (!databaseId) return res.status(400).json({ error: 'Invalid type' });

    try {
        if (req.method === 'POST') {
            const { content } = req.body;
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true });
        } else {
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50
            });
            const posts = response.results.map(page => {
                // 适配 Notion 的 Title 属性读取逻辑
                const titleObj = page.properties.Content?.title || [];
                const text = titleObj.length > 0 ? titleObj[0].plain_text : "";
                const dateVal = page.properties.Date?.date?.start || page.created_time;
                
                return text ? {
                    content: text,
                    date: new Date(dateVal).toLocaleString('zh-CN', {hour12:false}).replace(/\//g, '.')
                } : null;
            }).filter(p => p !== null);
            
            return res.status(200).json(posts);
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
