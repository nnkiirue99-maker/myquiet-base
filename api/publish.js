const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 1. 基础 Header 跨域（所有模式通用）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const type = req.query.type || body.type;

    // --- A. 网页读取逻辑 (最高优先级，防止网页 Empty) ---
    if (req.method === 'GET' && type && dbMap[type]) {
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
            // 必须直接返回数组，网页才能识别
            return res.status(200).json(posts);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // --- B. 核心 SSE 协议 (专门给 Claude 连接用) ---
    if (req.query.sse === 'true' || req.headers.accept === 'text/event-stream') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const endpointUrl = `https://${req.headers.host}/api/publish`;
        res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

        const tools = {
            jsonrpc: "2.0",
            result: {
                tools: [
                    {
                        name: "read_base",
                        description: "从基地读取笔记",
                        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] } }, required: ["type"] }
                    },
                    {
                        name: "write_base",
                        description: "向基地写入笔记",
                        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] }, content: { type: "string" } }, required: ["type", "content"] }
                    }
                ]
            }
        };
        res.write(`event: message\ndata: ${JSON.stringify(tools)}\n\n`);

        const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 8000);
        req.on('close', () => clearInterval(keepAlive));
        return;
    }

    // --- C. 工具调用逻辑 (Claude 发出的 POST 请求) ---
    if (body.method === 'tools/call' || body.action === 'call_tool') {
        const params = body.params || body;
        const toolName = params.name || body.tool_name;
        const args = params.arguments || body.arguments || {};
        const databaseId = dbMap[args.type];

        try {
            if (toolName === 'read_base' && databaseId) {
                const response = await notion.databases.query({ database_id: databaseId, page_size: 10 });
                const resultText = response.results.map(p => Object.values(p.properties).find(v => v.type === 'title')?.title[0]?.plain_text).join('\n');
                return res.status(200).json({ result: { content: [{ type: "text", text: resultText || "没有数据" }] } });
            }
            if (toolName === 'write_base' && databaseId) {
                await notion.pages.create({
                    parent: { database_id: databaseId },
                    properties: { 'Content': { title: [{ text: { content: args.content } }] } }
                });
                return res.status(200).json({ result: { content: [{ type: "text", text: "成功" }] } });
            }
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // --- D. 兜底响应 ---
    return res.status(200).json({ status: "Base Online" });
};
