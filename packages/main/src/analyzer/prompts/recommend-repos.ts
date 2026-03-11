/**
 * Build a prompt asking Claude to recommend open-source CLI tools on GitHub
 * that match the user's description.
 * Returns a prompt expecting a JSON array: [{ owner, repo, description, why }]
 */
export function buildRepoRecommendationPrompt(description: string): string {
  return `You are a helpful assistant that recommends open-source command-line tools available on GitHub.

The user wants to: "${description}"

Suggest 2-3 open-source CLI tools on GitHub that could help with this task.
Prefer well-known, actively maintained projects with Docker-friendly usage.

Respond with ONLY a valid JSON array (no markdown, no extra text):
[{"owner":"username","repo":"reponame","description":"One sentence about the tool.","why":"One sentence explaining why it fits this use case."}]`;
}
