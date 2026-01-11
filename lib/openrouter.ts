const MODEL = "google/gemini-2.0-flash-exp:free";

export async function generateSummary(diff: string, truncated: boolean): Promise<string> {
  const prompt = `You are reviewing a PR for OpenChaos - a repo where the internet votes on which PRs get merged. It's a democracy-driven open source experiment.

Analyze this PR diff and provide a brief summary.
${truncated ? "NOTE: This is a large PR, diff was truncated.\n" : ""}
Respond in this exact format (no markdown, just plain text):
SUMMARY: [1-2 sentences of what the PR does]
FILES: [count] ([list 3-5 main files])
IMPACT: [Low/Medium/High] - [brief note on what this affects]

Diff:
${diff}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Unable to generate summary";
}
