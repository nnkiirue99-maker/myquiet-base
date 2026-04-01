    try {
        const cursor = req.query.cursor || req.query.start_cursor;
        
        const response = await notion.databases.query({
            database_id: databaseId,
            // --- 修改 1: 增加双重排序，防止没填 Date 的记录失踪 ---
            sorts: [
                { property: "Date", direction: "descending" },
                { timestamp: "last_edited_time", direction: "descending" }
            ],
            page_size: 50, 
            start_cursor: cursor || undefined 
        });

        const posts = response.results.map(page => {
            const props = page.properties;
            
            // --- 修改 2: 暴力抓取所有可能的文字列 ---
            // 这里的逻辑：先找 Content，再找任何 Title 类型，最后实在不行找第一列的名字
            const allProps = Object.values(props);
            const titleObj = props.Content || allProps.find(p => p.type === 'title');
            const titleArr = titleObj?.title || [];
            const text = titleArr.map(t => t.plain_text).join('').trim();

            // --- 修改 3: 时间戳兼容性 ---
            const dateVal = props.Date?.date?.start || page.created_time;
            const date = new Date(dateVal).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai', 
                hour12: false, 
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            }).replace(/\//g, '.');
            
            return { content: text, date: date };
        }).filter(p => p.content.length > 0); // 只要有字就显示，不挑列名

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
