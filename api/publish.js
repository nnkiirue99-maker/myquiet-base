const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 基础设置：强制不缓存 + 跨域
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const type = req.method === 'POST' ? (req.body.type || req.query.type) : req.query.type;
    const databaseId = dbMap[type];

    try {
        // --- 写的逻辑 (POST) ---
        if (req.method === 'POST') {
            if (!databaseId) return res.status(400).json({ error: 'ID Missing' });
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: req.body.content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true, message: "写入成功" });
        } 
        
        // --- 读的逻辑 (GET) ---
        else {
            // 如果是 Claude 在问“你能干嘛”，返回工具列表（这就是 MCP 的核心）
            if (req.query.action === 'list_tools') {
                return res.status(200).json({
                    tools: [
                        { name: "read", description: "读取笔记 (MEMORY/EVENT/CAT1/CAT2)", inputSchema: { type: "object", properties: { type: { type: "string" } } } },
                        { name: "write", description: "写入笔记", inputSchema: { type: "object", properties: { type: { type: "string" }, content: { type: "string" } } } }
                    ]
                });
            }

            if (!databaseId) return res.status(400).json({ error: 'ID Missing' });

            const cursor = req.query.cursor || req.query.start_cursor;
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50,
                start_cursor: cursor || undefined
            });

            const posts = response.results.map(page => {
                const props = page.properties;
                const titleProp = Object.values(props).find(p => p.type === 'title');
                const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
                if (!text.trim() || text === "Untitled") return null;

                const dateVal = props.Date?.date?.start || page.created_time;
                const d = new Date(dateVal);
                const date = new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 16);
                
                return { content: text, date: date };
            }).filter(p => p !== null);

            // 返回数据，顺便带上翻页链接
            return res.status(200).json({
                posts,
                next_page_url: response.has_more ? `https://${req.headers.host}/api/publish?type=${type}&cursor=${response.next_cursor}` : null
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
