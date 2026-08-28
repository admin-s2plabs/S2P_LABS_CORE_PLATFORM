const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.REPO;
const PR_DIFF = process.env.PR_DIFF;

function getDiff() {
  if (!PR_DIFF || PR_DIFF.trim() === "") {
    throw new Error("PR_DIFF environment variable is empty or not set");
  }
  return PR_DIFF.slice(0, 15000); // avoid token overflow
}

async function reviewWithClaude(diffText) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `
You are a senior reviewer for a React.js + Node.js project.

Review this PR diff:

${diffText}

Focus on:
- React best practices (hooks, state, performance)
- Node.js backend issues
- Security vulnerabilities
- Code quality & readability
- Possible bugs

Respond in this format:
### Summary
### Issues
### Suggestions
### Final Verdict
          `
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function postComment(comment) {
  const url = `https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ body: comment })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${error}`);
  }
}

(async () => {
  try {
    const diff = getDiff();
    const review = await reviewWithClaude(diff);
    await postComment(review);
    console.log("Review posted successfully!");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
