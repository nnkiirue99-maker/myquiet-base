const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 强制禁用缓存 + 跨域
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
            const cursor = req.query.cursor || req.query.start_cursor;
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50, 
                start_cursor: cursor || undefined 
            });

            const posts = response.results.map(page => {
                const props = page.properties;
                
                // --- 全模块通用抓取逻辑 ---
                // 自动寻找任何类型为 'title' 的属性（Notion必有的第一列）
                const titleProp = Object.values(props).find(p => p.type === 'title');
                const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
                
                // 时间处理：统一使用东八区标准格式 (YYYY-MM-DD HH:mm)
                const dateVal = props.Date?.date?.start || page.created_time;
                const d = new Date(dateVal);
                const localDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
                const date = localDate.toISOString().replace('T', ' ').substring(0, 16);
                
                return { content: text, date: date };
            }).filter(p => p.content.trim() !== "");

            // --- 给 Claude 留的翻页链接 ---
            const nextLink = response.has_more ? 
                `https://${req.headers.host}/api/publish?type=${type}&cursor=${response.next_cursor}` : 
                null;

            return res.status(200).json({
                posts: posts,
                has_more: response.has_more,
                next_cursor: response.next_cursor,
                next_page_url: nextLink
            });
        }
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
