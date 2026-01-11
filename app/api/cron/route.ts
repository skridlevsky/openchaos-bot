import { NextRequest, NextResponse } from "next/server";
import { getOctokit, getOpenPRs, getPRComments, listInstallations } from "../../../lib/github";
import { reviewPR } from "../../../lib/review";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer {CRON_SECRET}
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) {
    return NextResponse.json({ error: "GITHUB_OWNER and GITHUB_REPO must be set" }, { status: 500 });
  }

  try {
    const installations = await listInstallations();
    const installation = installations.find(i => i.account?.login === owner);
    if (!installation) {
      return NextResponse.json({ error: "Bot not installed on repo" }, { status: 400 });
    }

    const octokit = await getOctokit(installation.id);
    const prs = await getOpenPRs(octokit, owner, repo);

    let reviewed = 0;
    let errors = 0;

    for (const pr of prs) {
      if (pr.changed_files === 0 || pr.draft) continue;

      try {
        const comments = await getPRComments(octokit, owner, repo, pr.number);
        const alreadyCommented = comments.some(c => c.body?.includes("OpenChaos Bot"));
        if (alreadyCommented) continue;

        const success = await reviewPR(octokit, owner, repo, pr);
        if (success) reviewed++;
      } catch (e) {
        console.error(`Cron: Failed to review PR #${pr.number}:`, e);
        errors++;
      }

      // Stop after 10 to stay within time/rate limits
      if (reviewed + errors >= 10) break;
    }

    return NextResponse.json({ ok: true, reviewed, errors });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
