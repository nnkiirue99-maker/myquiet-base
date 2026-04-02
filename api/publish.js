const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const dbMap = {
    'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
    'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
    'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
    'CAT2': process.env.NOTION_DATABASE_ID_CAT2,
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const type = req.query.type;
    const databaseId = dbMap[type];

    if (!databaseId) {
        return res.status(400).json({ error: 'ID Missing or Invalid Type' });
    }

    try {
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
                
                // 为了排查 empty，我们暂时放宽过滤条件
                if (!text || text === "Untitled") return null;

                const dateVal = props.Date?.date?.start || page.created_time;
                const d = new Date(dateVal);
                const localDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
                const date = localDate.toISOString().replace('T', ' ').substring(0, 16);
                
                return { content: text, date: date };
            })
            .filter(p => p !== null);

        return res.status(200).json(posts);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
