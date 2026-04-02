// 引入 Notion 官方工具
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// 你的四个“抽屉”地址
const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 处理 AI 发过来的请求（POST 是写，GET 是读）
    const type = req.method === 'POST' ? req.body.type : req.query.type;
    const databaseId = dbMap[type];

    if (!databaseId) return res.status(400).json({ error: '找不到对应的数据库模块' });

    try {
        if (req.method === 'POST') {
            // --- 写的逻辑：往 Notion 里塞一条新笔记 ---
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: req.body.content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ message: "写入成功" });

        } else {
            // --- 读的逻辑：从 Notion 里把最近的笔记拿出来 ---
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 20 // 每次让 AI 读 20 条，太多它会累
            });

            const posts = response.results
                .map(page => {
                    const text = page.properties.Content?.title[0]?.plain_text || "";
                    if (!text.trim()) return null;
                    return { 内容: text, 时间: page.created_time };
                })
                .filter(p => p !== null);

            return res.status(200).json(posts);
        }
    } catch (e) {
        return res.status(500).json({ error: "出错啦: " + e.message });
    }
};
