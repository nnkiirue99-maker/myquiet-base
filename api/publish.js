const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 基础 Header 设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const type = req.query.type;

    // --- 1. 网页读取逻辑 (最高优先级) ---
    // 只要是正常的 GET 请求且带了 type，就只返回纯数组
    if (req.method === 'GET' && type && !req.query.sse) {
        try {
            const databaseId = dbMap[type];
            if (!databaseId) return res.status(400).json({ error: 'Invalid Type' });

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

            // ⚠️ 网页的核心：必须直接返回数组
            return res.status(200).json(posts);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // --- 2. Claude SSE 逻辑 (只有带 ?sse=true 才会进入) ---
    if (req.query.sse === 'true' || req.headers.accept === 'text/event-stream') {
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
                        inputSchema: { type: "object", properties: { type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] } }, required: ["type"] }
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

    // --- 3. 工具执行逻辑 (POST 模式) ---
    if (req.method === 'POST') {
        const body = req.body || {};
        try {
            const finalType = body.type || (body.params?.arguments?.type);
            const content = body.content || (body.params?.arguments?.content);
            const databaseId = dbMap[finalType];

            if (!databaseId) return res.status(400).json({ error: 'ID Missing' });

            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });

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
