const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 1. 基础 Header 设置（SSE 必须项）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. 核心 SSE 逻辑：当 Claude 访问 /api/publish?sse=true 时启动
    if (req.query.sse === 'true' || req.headers.accept === 'text/event-stream') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 发送初始化消息（符合 MCP 协议的 endpoint 事件）
        const endpointUrl = `https://${req.headers.host}/api/publish`;
        res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

        // 推送工具定义
        const tools = {
            jsonrpc: "2.0",
            result: {
                tools: [
                    {
                        name: "read_base",
                        description: "从 Notion 读取数据",
                        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] } }, required: ["type"] }
                    },
                    {
                        name: "write_base",
                        description: "写入数据到 Notion",
                        inputSchema: { type: "object", properties: { type: { type: "string" }, content: { type: "string" } }, required: ["type", "content"] }
                    }
                ]
            }
        };
        res.write(`event: message\ndata: ${JSON.stringify(tools)}\n\n`);

        // Vercel 必须通过持续发送注释来防止超时
        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 8000);

        req.on('close', () => clearInterval(keepAlive));
        return;
    }

    // 3. 处理工具调用（当 Claude 连上 SSE 后，会通过 POST 发送调用）
    const body = req.body || {};
    if (body.method === 'tools/call' || body.action === 'call_tool') {
        try {
            const params = body.params || body;
            const toolName = params.name || body.tool_name;
            const args = params.arguments || body.arguments || {};
            const databaseId = dbMap[args.type];

            if (toolName === 'read_base') {
                const response = await notion.databases.query({ database_id: databaseId, page_size: 10 });
                const posts = response.results.map(p => {
                    const text = Object.values(p.properties).find(v => v.type === 'title')?.title[0]?.plain_text || "";
                    return { content: text, date: p.created_time };
                });
                return res.status(200).json({ result: { content: [{ type: "text", text: JSON.stringify(posts) }] } });
            }

            if (toolName === 'write_base') {
                await notion.pages.create({
                    parent: { database_id: databaseId },
                    properties: { 'Content': { title: [{ text: { content: args.content } }] } }
                });
                return res.status(200).json({ result: { content: [{ type: "text", text: "写入成功" }] } });
            }
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // 4. 网页读取逻辑（保持纯数组返回，确保网页不报错）
    const type = req.query.type;
    if (type && dbMap[type]) {
        try {
            const response = await notion.databases.query({
                database_id: dbMap[type],
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
            return res.status(200).json(posts);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(200).json({ status: "Base SSE API Online" });
};
