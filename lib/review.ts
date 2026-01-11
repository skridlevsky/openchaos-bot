import { getPRDiff, postComment, getCIStatus, PullRequest } from "./github";
import { generateSummary } from "./openrouter";

export type { PullRequest };

const MAX_DIFF_LINES = 500;
const reviewCount = new Map<number, number>(); // hour -> count

function getRateLimitKey(): number {
  return Math.floor(Date.now() / 3600000);
}

export function checkRateLimit(): boolean {
  const key = getRateLimitKey();
  const count = reviewCount.get(key) || 0;
  return count < 20;
}

function incrementRateLimit() {
  const key = getRateLimitKey();
  reviewCount.set(key, (reviewCount.get(key) || 0) + 1);
  // Clean old entries
  for (const k of reviewCount.keys()) if (k < key) reviewCount.delete(k);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reviewPR(octokit: any, owner: string, repo: string, pr: PullRequest): Promise<boolean> {
  if (!checkRateLimit()) return false;
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
  const [summaryLine, filesLine, impactLine] = summary.split("\n").filter(l => l.trim());

  const comment = `🤖 **OpenChaos Bot**

**Summary:** ${summaryLine?.replace(/^SUMMARY:\s*/i, "") || "N/A"}

**Files changed:** ${filesLine?.replace(/^FILES:\s*/i, "") || `${pr.changed_files}`}

**Impact:** ${impactLine?.replace(/^IMPACT:\s*/i, "") || "Unknown"}
${truncated ? "\n⚠️ *Large PR - partial review*" : ""}
---
*[openchaos-bot](https://github.com/skridlevsky/openchaos-bot)*`;

  await postComment(octokit, owner, repo, pr.number, comment);
  incrementRateLimit();
  return true;
}
