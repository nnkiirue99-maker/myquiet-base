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
    if (!databaseId) return res.status(400).json({ error: 'ID Missing' });

    try {
        if (req.method === 'POST') {
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: req.body.content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true });
        } else {
            const { start_cursor } = req.query;
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 15, 
                start_cursor: start_cursor || undefined 
            });

            const posts = response.results.map(page => {
                const props = page.properties;
                const titleArr = props.Content?.title || [];
                const text = titleArr.length > 0 ? titleArr[0].plain_text : "";
                const dateVal = props.Date?.date?.start || page.created_time;
                const date = new Date(dateVal).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                }).replace(/\//g, '.');
                return { content: text, date: date };
            }).filter(p => p.content !== "");

            return res.status(200).json({
                posts: posts,
                next_cursor: response.next_cursor,
                has_more: response.has_more
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
