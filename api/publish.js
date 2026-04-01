const { Octokit } = require("@octokit/rest");
const octokit = new Octokit({ auth: process.env.GH_TOKEN });
const [owner, repo] = process.env.GH_REPO.split('/');

export default async function handler(req, res) {
    const { type, page = 1 } = req.query;
    if (!type) return res.status(400).json({ error: "Missing type" });
    const fileName = `${type.toLowerCase()}.json`;

    try {
        const { data } = await octokit.repos.getContent({
            owner, repo, path: fileName,
        });
        const content = Buffer.from(data.content, 'base64').toString();
        let allPosts = JSON.parse(content);

        // 排序并分页
        allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
        const PAGE_SIZE = 15;
        const start = (page - 1) * PAGE_SIZE;
        const pagedPosts = allPosts.slice(start, start + PAGE_SIZE);

        return res.status(200).json({
            posts: pagedPosts,
            has_more: allPosts.length > start + PAGE_SIZE
        });
    } catch (error) {
        return res.status(500).json({ error: "Read Error", details: error.message });
    }
}
