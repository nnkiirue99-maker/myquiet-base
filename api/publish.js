const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 基础 Header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const type = req.query.type || body.type;

    // --- 1. 专门对付 Claude 的 SSE 连接 (只有带 sse=true 才会进这里) ---
    if (req.query.sse === 'true') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const tools = {
            jsonrpc: "2.0",
            result: {
                tools: [
                    {
                        name: "read_base",
                        description: "读取基地数据",
                        inputSchema: { type: "object", properties: { type: { type: "string" } }, required: ["type"] }
                    },
                    {
                        name: "write_base",
                        description: "写入基地数据",
                        inputSchema: { type: "object", properties: { type: { type: "string" }, content: { type: "string" } }, required: ["type", "content"] }
                    }
                ]
            }
        };

        res.write(`event: endpoint\ndata: https://${req.headers.host}/api/publish\n\n`);
        res.write(`event: message\ndata: ${JSON.stringify(tools)}\n\n`);

        const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 8000);
        req.on('close', () => clearInterval(keepAlive));
        return;
    }

    // --- 2. 网页读取逻辑 (严格模仿你最原始的代码结构，防止 ERROR) ---
    if (req.method === 'GET' && type) {
        try {
            const databaseId = dbMap[type];
            if (!databaseId) return res.status(400).json({ error: 'ID Missing' });

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

            // ⚠️ 极其重要：直接返回数组，不要包任何对象，否则你的网页会报 ERROR
            return res.status(200).json(posts);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // --- 3. 工具执行逻辑 (POST 模式) ---
    if (req.method === 'POST') {
        try {
            // 兼容普通网页写入和 MCP 工具调用
            const finalType = body.type || (body.params && body.params.arguments && body.params.arguments.type);
            const content = body.content || (body.params && body.params.arguments && body.params.arguments.content);
            const databaseId = dbMap[finalType];

            if (!databaseId) return res.status(400).json({ error: 'ID Missing' });

            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });

            // 如果是 MCP 调用，返回符合协议的格式；否则返回普通成功
            if (body.method === 'tools/call') {
                return res.status(200).json({ result: { content: [{ type: "text", text: "Done" }] } });
            }
            return res.status(200).json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(200).json({ status: "Base Online" });
};
