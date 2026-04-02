const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 强制跨域 Header，Claude 连接必须
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. MCP 工具列表入口
    if (req.query.action === 'list_tools') {
        return res.status(200).send({
            tools: [
                {
                    name: "read_base",
                    description: "Read records from base (MEMORY/EVENT/CAT1/CAT2)",
                    inputSchema: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] }
                        },
                        required: ["type"]
                    }
                },
                {
                    name: "write_base",
                    description: "Write a new record to base",
                    inputSchema: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] },
                            content: { type: "string" }
                        },
                        required: ["type", "content"]
                    }
                }
            ]
        });
    }

    // 2. 正常逻辑处理
    const type = req.method === 'POST' ? (req.body?.type || req.query.type) : req.query.type;
    const databaseId = dbMap[type];

    try {
        if (req.method === 'POST') {
            if (!databaseId) return res.status(400).json({ error: 'ID Missing' });
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: req.body.content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true });
        } else {
            if (!databaseId) return res.status(400).json({ error: 'Type is required' });
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50
            });
            const posts = response.results.map(page => {
                const titleProp = Object.values(page.properties).find(p => p.type === 'title');
                const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
                if (!text.trim() || text === "Untitled") return null;
                const d = new Date(page.created_time);
                const date = new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 16);
                return { content: text, date: date };
            }).filter(p => p !== null);
            return res.status(200).json({ posts });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
