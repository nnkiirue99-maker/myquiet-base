const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const databaseMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 允许 Claude 跨域访问
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 验证暗号：如果是外部请求，必须带上 API_KEY
    const apiKey = req.headers.authorization?.replace('Bearer ', '') || req.query.api_key;
    const isInternal = req.headers.referer?.includes('vercel.app');
    
    if (!isInternal && apiKey !== process.env.CLAUDE_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized channel' });
    }

    // 读取历史（GET）
    if (req.method === 'GET') {
        const { type } = req.query;
        const databaseId = databaseMap[type?.toUpperCase()];
        if (!databaseId) return res.status(400).json({ error: 'Invalid type' });
        try {
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: '日期', direction: 'descending' }],
                page_size: 50,
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

    // 写入新记录（POST）
    if (req.method === 'POST') {
        const { type, content } = req.body;
        const databaseId = databaseMap[type?.toUpperCase()];
        if (!databaseId) return res.status(400).json({ error: 'Invalid type' });
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
