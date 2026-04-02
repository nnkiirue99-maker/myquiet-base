const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 基础跨域设置
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // ===== 核心：SSE 协议处理 (专门应对 Claude Custom Connector) =====
    // 如果 Claude 尝试建立长连接 (SSE)
    if (req.headers.accept === 'text/event-stream') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 1. 发送工具清单 (模拟 MCP initialize/list_tools)
        const toolsData = {
            tools: [
                {
                    name: "read_base",
                    description: "从基地读取笔记 (MEMORY/EVENT/CAT1/CAT2)",
                    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] } }, required: ["type"] }
                },
                {
                    name: "write_base",
                    description: "向基地写入笔记",
                    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["MEMORY", "EVENT", "CAT1", "CAT2"] }, content: { type: "string" } }, required: ["type", "content"] }
                }
            ]
        };

        // 写入 SSE 格式的数据
        res.write(`event: endpoint\ndata: ${req.url}\n\n`);
        res.write(`event: tools\ndata: ${JSON.stringify(toolsData)}\n\n`);
        
        // Vercel 环境下不能无限挂起，发送完初始信息后保持几秒心跳即可
        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 5000);

        req.on('close', () => clearInterval(keepAlive));
        return; 
    }

    // ===== 正常的 HTTP 业务逻辑 (兼容网页和工具调用) =====
    const body = req.body || {};
    const action = req.query.action || body.action;

    try {
        // 处理 MCP 工具调用请求
        if (action === 'call_tool') {
            const { tool_name, arguments: args } = body;
            const databaseId = dbMap[args.type];
            if (!databaseId) return res.status(400).json({ error: "Invalid type" });

            if (tool_name === "read_base") {
                const response = await notion.databases.query({
                    database_id: databaseId,
                    sorts: [{ property: 'Date', direction: 'descending' }],
                    page_size: 10
                });
                const posts = response.results.map(page => {
                    const titleProp = Object.values(page.properties).find(p => p.type === 'title');
                    const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
                    return { content: text, date: page.created_time };
                });
                return res.status(200).json({ content: [{ type: "text", text: JSON.stringify(posts) }] });
            }

            if (tool_name === "write_base") {
                await notion.pages.create({
                    parent: { database_id: databaseId },
                    properties: {
                        'Content': { title: [{ text: { content: args.content || "" } }] },
                        'Date': { date: { start: new Date().toISOString() } }
                    }
                });
                return res.status(200).json({ content: [{ type: "text", text: `已写入 ${args.type}` }] });
            }
        }

        // ===== 原有网页读取/写入逻辑 (保持不变) =====
        const type = req.method === 'POST' ? body.type : req.query.type;
        if (!type) return res.status(200).json({ status: "Base Online" });

        const databaseId = dbMap[type];
        if (req.method === 'POST') {
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: body.content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true });
        } else {
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50
            });
            const posts = response.results.map(page => {
                const titleProp = Object.values(page.properties).find(p => p.type === 'title');
                const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
                if (!text.trim() || text === "Untitled") return null;
                return { content: text, date: page.created_time };
            }).filter(p => p !== null);
            return res.status(200).json({ posts });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
