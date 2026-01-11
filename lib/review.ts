import { getPRDiff, postComment, getCIStatus, PullRequest } from "./github";
import { generateSummary } from "./openrouter";

export type { PullRequest };

const MAX_DIFF_LINES = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reviewPR(octokit: any, owner: string, repo: string, pr: PullRequest): Promise<boolean> {
  if (pr.state === "closed") return false;
  if (pr.draft) return false;
  if (pr.changed_files === 0) return false;
  if (pr.head?.sha) {
    const ciStatus = await getCIStatus(octokit, owner, repo, pr.head.sha);
    if (ciStatus === "failure") return false;
  }

  let diff = await getPRDiff(octokit, owner, repo, pr.number);
  const lines = diff.split("\n");
  const truncated = lines.length > MAX_DIFF_LINES;
  if (truncated) diff = lines.slice(0, MAX_DIFF_LINES).join("\n");

  const summary = await generateSummary(diff, truncated);

  // Don't post comment if summary generation failed
  if (!summary) {
    console.error(`Failed to generate summary for PR #${pr.number}`);
    return false;
  }

  const [summaryLine, filesLine, impactLine] = summary.split("\n").filter(l => l.trim());

  const comment = `🤖 **OpenChaos Bot**

**Summary:** ${summaryLine?.replace(/^SUMMARY:\s*/i, "") || "N/A"}

**Files changed:** ${filesLine?.replace(/^FILES:\s*/i, "") || `${pr.changed_files}`}

**Impact:** ${impactLine?.replace(/^IMPACT:\s*/i, "") || "Unknown"}
${truncated ? "\n⚠️ *Large PR - partial review*" : ""}
---
*[openchaos-bot](https://github.com/skridlevsky/openchaos-bot)*`;

  await postComment(octokit, owner, repo, pr.number, comment);
  return true;
}
