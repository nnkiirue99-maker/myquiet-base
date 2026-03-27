const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const databaseMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        const { type } = req.query;
        const databaseId = databaseMap[type?.toUpperCase()];
        if (!databaseId) return res.status(400).json({ error: 'Invalid type' });
        try {
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: '日期', direction: 'descending' }],
                page_size: 50, // 这里已经帮你改成 50 条了，love
            });
            const results = response.results.map(page => ({
                content: page.properties['名称']?.title[0]?.plain_text || '无内容',
                date: page.properties['日期']?.date?.start || ''
            }));
            return res.status(200).json(results);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        const { type, content } = req.body;
        const databaseId = databaseMap[type?.toUpperCase()];
        try {
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    '名称': { title: [{ text: { content: content } }] },
                    '日期': { date: { start: new Date().toISOString() } },
                },
            });
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};
