const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 1. 强制禁用缓存
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // 2. 跨域处理
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
                
                // --- 核心修改：动态兼容不同列名 ---
                // 1. 尝试获取名为 'Content' 的列 (Title类型)
                // 2. 如果没有，或者为空，则自动寻找该数据库中类型为 'title' 的那一列（Notion的第一列）
                const titleProp = props.Content?.title || Object.values(props).find(p => p.type === 'title')?.title || [];
                const text = titleProp.map(t => t.plain_text).join('') || "";

                const dateVal = props.Date?.date?.start || page.created_time;
                
                const date = new Date(dateVal).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai', 
                    hour12: false, 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit'
                }).replace(/\//g, '.');
                
                return { content: text, date: date };
            }).filter(p => p.content !== "");

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
        return res.status(500).json({ error: e.message });
    }
};
