const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // --- 1. 强制禁用缓存，确保 Claude 每次读都是最新的 ---
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // --- 2. 跨域处理 ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 自动识别是从 URL 参数还是从 POST Body 获取 type
    const type = req.method === 'POST' ? req.body.type : req.query.type;
    const databaseId = dbMap[type];
    if (!databaseId) return res.status(400).json({ error: 'ID Missing' });

    try {
        if (req.method === 'POST') {
            // 写入逻辑保持不变
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: req.body.content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true });
        } else {
            // --- 3. 读取逻辑：完善翻页参数支持 ---
            // 同时支持 start_cursor 和 cursor 两个名字（兼容性更强）
            const cursor = req.query.cursor || req.query.start_cursor;
            
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50, 
                start_cursor: cursor || undefined 
            });

            const posts = response.results.map(page => {
                const props = page.properties;
                const titleArr = props.Content?.title || [];
                const text = titleArr.length > 0 ? titleArr[0].plain_text : "";
                const dateVal = props.Date?.date?.start || page.created_time;
                
                // 东八区时间美化 (2024.03.28 14:00)
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

            // --- 4. 重点：把“下一页”的链接格式直接吐给 Claude ---
            const nextLink = response.has_more ? 
                `https://${req.headers.host}/api/publish?type=${type}&cursor=${response.next_cursor}` : 
                null;

            return res.status(200).json({
                posts: posts,
                has_more: response.has_more,
                next_cursor: response.next_cursor,
                next_page_url: nextLink // 这一行是专门喂给 Claude 的
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
