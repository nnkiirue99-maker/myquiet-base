import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
    // 增加跨域支持，确保 Claude 的 web_fetch 能够顺利敲门
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { type, content } = req.body;

    // 匹配数据库 ID
    const databaseIdMap = {
        'MEMORY': process.env.NOTION_DATABASE_ID_MEMORY,
        'EVENT': process.env.NOTION_DATABASE_ID_EVENT,
        'CAT1': process.env.NOTION_DATABASE_ID_CAT1,
        'CAT2': process.env.NOTION_DATABASE_ID_CAT2
    };

    const databaseId = databaseIdMap[type];

    if (!databaseId || !content) {
        return res.status(400).json({ error: 'Missing type or content' });
    }

    try {
        await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                'Content': { title: [{ text: { content: content } }] },
                'Date': { 
                    date: { 
                        // 强制锁定东八区时间
                        start: new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().split('.')[0] + '+08:00'
                    } 
                }
            }
        });
        return res.status(200).json({ success: true, message: `Successfully saved to ${type}` });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
