import { NextRequest, NextResponse } from "next/server";
import { getOctokit, getOpenPRs, getPRComments, listInstallations } from "@/lib/github";
import { reviewPR } from "@/lib/review";

const DELAY_MS = 5000;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.BACKFILL_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!owner || !repo) {
    return NextResponse.json({ error: "GITHUB_OWNER and GITHUB_REPO must be set" }, { status: 500 });
  }

  // Get installation for the repo
  const installations = await listInstallations();
  const installation = installations.find(i => i.account?.login === owner);
  if (!installation) {
    return NextResponse.json({ error: "Bot not installed on repo" }, { status: 400 });
  }

  const octokit = await getOctokit(installation.id);
  const prs = await getOpenPRs(octokit, owner, repo);

  const results: { pr: number; status: string }[] = [];

  for (const pr of prs) {
    if (pr.changed_files === 0) {
      results.push({ pr: pr.number, status: "skipped: 0 files" });
      continue;
    }

    const comments = await getPRComments(octokit, owner, repo, pr.number);
    const alreadyCommented = comments.some(c => c.body?.includes("OpenChaos Bot"));
    if (alreadyCommented) {
      results.push({ pr: pr.number, status: "skipped: already commented" });
      continue;
    }

    const reviewed = await reviewPR(octokit, owner, repo, pr);
    results.push({ pr: pr.number, status: reviewed ? "reviewed" : "skipped" });

    if (reviewed) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return NextResponse.json({ ok: true, results });
}
