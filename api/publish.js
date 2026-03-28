const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    // 跨域处理
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const type = req.method === 'POST' ? req.body.type : req.query.type;
    const databaseId = dbMap[type];

    if (!databaseId) return res.status(400).json({ error: 'Database ID not found' });

    try {
        if (req.method === 'POST') {
            const { content } = req.body;
            // 发布时强制使用 ISO 时间戳，Notion 会自动识别
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    'Content': { title: [{ text: { content: content || "" } }] },
                    'Date': { date: { start: new Date().toISOString() } }
                }
            });
            return res.status(200).json({ success: true });
        } else {
            // 读取数据
            const response = await notion.databases.query({
                database_id: databaseId,
                sorts: [{ property: 'Date', direction: 'descending' }],
                page_size: 50
            });

            const posts = response.results.map(page => {
                const props = page.properties;
                
                // 1. 安全读取 Content (Title类型)
                const titleObj = props.Content?.title || [];
                const text = titleObj.length > 0 ? titleObj[0].plain_text : "";
                
                // 2. 关键修改：处理东八区时间
                // 如果 Date 属性没填，则退而求其次使用页面创建时间
                const dateVal = props.Date?.date?.start || page.created_time;
                
                const formattedDate = new Date(dateVal).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai', // 强制指定北京时间
                    hour12: false,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }).replace(/\//g, '.'); // 保持你喜欢的 2026.03.28 格式

                return text ? {
                    content: text,
                    date: formattedDate
                } : null;
            }).filter(p => p !== null);
            
            return res.status(200).json(posts);
        }
    } catch (error) {
        console.error(error); // 在 Vercel 日志中打印错误
        return res.status(500).json({ error: error.message });
    }
};
