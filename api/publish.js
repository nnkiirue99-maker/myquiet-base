const { Client } = require(’@notionhq/client’);
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
‘MEMORY’: process.env.NOTION_DATABASE_ID_MEMORY,
‘EVENT’: process.env.NOTION_DATABASE_ID_EVENT,
‘CAT1’: process.env.NOTION_DATABASE_ID_CAT1,
‘CAT2’: process.env.NOTION_DATABASE_ID_CAT2,
};

// ===== MCP Protocol Handlers =====

function mcpToolsList() {
return {
tools: [
{
name: “read_base”,
description: “从基地读取笔记 (MEMORY/EVENT/CAT1/CAT2)”,
inputSchema: {
type: “object”,
properties: {
type: { type: “string”, enum: [“MEMORY”, “EVENT”, “CAT1”, “CAT2”] }
},
required: [“type”]
}
},
{
name: “write_base”,
description: “向基地写入笔记”,
inputSchema: {
type: “object”,
properties: {
type: { type: “string”, enum: [“MEMORY”, “EVENT”, “CAT1”, “CAT2”] },
content: { type: “string” }
},
required: [“type”, “content”]
}
}
]
};
}

async function mcpToolCall(toolName, args) {
if (toolName === “read_base”) {
const type = args.type;
const databaseId = dbMap[type];
if (!databaseId) return { error: “Invalid type” };

```
    const response = await notion.databases.query({
        database_id: databaseId,
        sorts: [{ property: 'Date', direction: 'descending' }],
        page_size: 50
    });

    const posts = response.results
        .map(page => {
            const props = page.properties;
            const titleProp = Object.values(props).find(p => p.type === 'title');
            const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
            const trimmedText = text.trim();
            if (!trimmedText || trimmedText === "Untitled") return null;
            const dateVal = props.Date?.date?.start || page.created_time;
            const d = new Date(dateVal);
            const localDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
            const date = localDate.toISOString().replace('T', ' ').substring(0, 16);
            return { content: text, date: date };
        })
        .filter(p => p !== null);

    return { posts, has_more: response.has_more };
}

if (toolName === "write_base") {
    const type = args.type;
    const content = args.content;
    const databaseId = dbMap[type];
    if (!databaseId) return { error: "Invalid type" };

    await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
            'Content': { title: [{ text: { content: content || "" } }] },
            'Date': { date: { start: new Date().toISOString() } }
        }
    });
    return { success: true, message: `已写入 ${type}` };
}

return { error: "Unknown tool" };
```

}

// ===== Main Handler =====

module.exports = async (req, res) => {
// Headers
res.setHeader(‘Cache-Control’, ‘no-store, no-cache, must-revalidate’);
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET,POST,OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
if (req.method === ‘OPTIONS’) return res.status(200).end();

```
// ===== MCP Routes =====
const action = req.query.action || (req.body && req.body.action);

// MCP: list tools
if (action === 'list_tools') {
    return res.status(200).json(mcpToolsList());
}

// MCP: call tool
if (action === 'call_tool') {
    try {
        const { tool_name, arguments: args } = req.body;
        const result = await mcpToolCall(tool_name, args || {});
        return res.status(200).json({
            content: [{ type: "text", text: JSON.stringify(result) }]
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({
            content: [{ type: "text", text: JSON.stringify({ error: e.message }) }]
        });
    }
}

// ===== Original API Routes (backwards compatible) =====
const type = req.method === 'POST' ? (req.body && req.body.type) : req.query.type;

// If no type and no action, return help
if (!type && !action) {
    return res.status(200).json({
        message: "Rue & Claude Base API",
        endpoints: {
            read: "GET ?type=MEMORY|EVENT|CAT1|CAT2",
            write: "POST {type, content}",
            mcp_list: "GET ?action=list_tools",
            mcp_call: "POST {action: 'call_tool', tool_name, arguments}"
        }
    });
}

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

        const posts = response.results
            .map(page => {
                const props = page.properties;
                const titleProp = Object.values(props).find(p => p.type === 'title');
                const text = titleProp?.title?.map(t => t.plain_text).join('') || "";
                const trimmedText = text.trim();
                if (!trimmedText || trimmedText === "Untitled") return null;
                const dateVal = props.Date?.date?.start || page.created_time;
                const d = new Date(dateVal);
                const localDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
                const date = localDate.toISOString().replace('T', ' ').substring(0, 16);
                return { content: text, date: date };
            })
            .filter(p => p !== null);

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
```

};
