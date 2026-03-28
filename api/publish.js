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

    if (req.method === 'POST') {
        const { type, content } = req.body;
        const databaseId = dbMap[type];
        if (!databaseId) return res.status(400).json({ error: 'Invalid type' });

        try {
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: content } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        const { type } = req.query;
        const databaseId = dbMap[type];
        if (!databaseId) return res.status(400).json({ error: 'Missing type' });
        
        try {
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
            });
            const posts = response.results.map(page => ({
                content: page.properties.Content?.title[0]?.plain_text || "无内容",
                date: new Date(page.created_time).toLocaleString('zh-CN', {hour12:false})
            }));
            res.status(200).json(posts);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};
