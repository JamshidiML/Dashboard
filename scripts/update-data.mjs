// Regenerates data.json from the GitHub REST API.
// Runs inside GitHub Actions, authenticated with the built-in GITHUB_TOKEN
// (5,000 requests/hour — plenty for ~15 repos once a day).
//
// Usage: node scripts/update-data.mjs <github-username>
// Env:   GITHUB_TOKEN must be set (Actions sets this automatically).

const USERNAME = process.argv[2] || "JamshidiML";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("GITHUB_TOKEN is not set.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub API ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Weekly commit activity can return 202 while GitHub computes stats.
// Retry a few times with a short delay.
async function commitActivity(owner, repo) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`,
      { headers }
    );
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // last 12 weeks, total commits per week
    return data.slice(-12).map((w) => w.total);
  }
  return [];
}

function classifyStatus({ pushed_at, code_loc, doc_loc }) {
  const days = pushed_at
    ? Math.floor((Date.now() - new Date(pushed_at).getTime()) / 86400000)
    : 9999;
  const hasCode = code_loc > 0;

  if (!hasCode && doc_loc === 0) return "empty";
  if (!hasCode) return "planning";
  if (days <= 21) return "active";
  if (days <= 120) return "dormant";
  return "stale";
}

const CODE_EXT = new Set([
  "py", "ts", "tsx", "js", "jsx", "go", "rs", "java", "rb", "c", "cpp", "cs", "swift",
]);

async function locBreakdown(owner, repo) {
  // languages endpoint gives byte counts, not lines — used only as a fallback signal
  const langs = await gh(`/repos/${owner}/${repo}/languages`);
  return langs || {};
}

async function main() {
  const repos = await gh(`/users/${USERNAME}/repos?per_page=100&type=owner`);
  const out = [];

  for (const r of repos) {
    const [commits, weekly, langs] = await Promise.all([
      gh(`/repos/${USERNAME}/${r.name}/commits?per_page=1`),
      commitActivity(USERNAME, r.name),
      locBreakdown(USERNAME, r.name),
    ]);

    let commitCount = null;
    let lastCommitMessage = null;
    if (commits && commits.length) {
      lastCommitMessage = commits[0].commit.message.split("\n")[0];
    }
    // Total commit count isn't directly exposed; approximate from weekly stats when present.
    if (weekly.length) {
      commitCount = weekly.reduce((a, b) => a + b, 0);
    }

    const codeBytes = Object.entries(langs)
      .filter(([k]) => !["Markdown", "HTML", "CSS"].includes(k))
      .reduce((a, [, v]) => a + v, 0);
    const docBytes = langs["Markdown"] || 0;

    const status = classifyStatus({
      pushed_at: r.pushed_at,
      code_loc: codeBytes,
      doc_loc: docBytes,
    });

    out.push({
      name: r.name,
      description: r.description,
      status,
      primary_language: r.language,
      code_loc: Math.round(codeBytes / 40), // rough bytes->lines estimate
      doc_loc: Math.round(docBytes / 40),
      has_tests: null, // left for manual/periodic deep audit; API can't tell this cheaply
      has_ci: null,
      commit_count: commitCount,
      first_commit: null,
      last_commit: r.pushed_at,
      last_commit_message: lastCommitMessage,
      update_line1: r.description || "No description set.",
      update_line2: lastCommitMessage
        ? `Last: ${lastCommitMessage}`
        : "No commits found.",
      weekly_commits: weekly,
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    generated_by: "github-action",
    repos: out,
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("data.json", JSON.stringify(payload, null, 2));
  console.log(`Wrote data.json with ${out.length} repos.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
