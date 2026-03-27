const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseMap = {
    'memory': process.env.NOTION_DATABASE_ID_MEMORY,
    'event': process.env.NOTION_DATABASE_ID_EVENT,
    'cat1': process.env.NOTION_DATABASE_ID_CAT1,
    'cat2': process.env.NOTION_DATABASE_ID_CAT2,
};
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { moduleName, content } = req.body;
    try {
        await notion.pages.create({
            parent: { database_id: databaseMap[moduleName] },
            properties: {
                '名称': { title: [{ text: { content: content } }] },
                '日期': { date: { start: new Date().toISOString() } },
            },
        });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
