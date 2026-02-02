import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, getOctokit } from "../../../lib/github";
import { reviewPR } from "../../../lib/review";
import { notifyMerge, notifyNewPR, notifyNewIssue } from "../../../lib/discord";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  if (!await verifyWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const repoName = data.repository?.name || "openchaos";

  // Issue opened → notify #proposals
  if (event === "issues" && data.action === "opened") {
    const issue = data.issue;
    if (!issue) {
      return NextResponse.json({ error: "Missing issue in payload" }, { status: 400 });
    }

    const notified = await notifyNewIssue({
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      author: issue.user?.login || "unknown",
      authorUrl: issue.user?.html_url || "",
      authorAvatar: issue.user?.avatar_url || "",
      url: issue.html_url,
      repo: repoName,
      labels: (issue.labels || []).map((l: { name: string }) => l.name),
    });

    return NextResponse.json({ ok: true, event: "issue.opened", notified });
  }

  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, skipped: "Not a handled event" });
  }

  const pr = data.pull_request;
  const installationId = data.installation?.id;
  const repoOwner = data.repository?.owner?.login;

  if (!pr || !installationId || !repoOwner || !repoName) {
    return NextResponse.json({ error: "Missing required fields in payload" }, { status: 400 });
  }

  // PR merged → notify #log
  if (data.action === "closed" && pr.merged) {
    const notified = await notifyMerge({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || "unknown",
      authorUrl: pr.user?.html_url || `https://github.com/${pr.user?.login}`,
      authorAvatar: pr.user?.avatar_url || "",
      url: pr.html_url,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      changedFiles: pr.changed_files || 0,
      repo: repoName,
    });
    return NextResponse.json({ ok: true, notified });
  }

  // PR opened or ready for review → notify #proposals + generate AI review
  if (data.action === "opened" || data.action === "ready_for_review") {
    // Notify #proposals (skip drafts on open — they'll notify when marked ready)
    let notified = false;
    if (!pr.draft) {
      notified = await notifyNewPR({
        number: pr.number,
        title: pr.title,
        body: pr.body || "",
        author: pr.user?.login || "unknown",
        authorUrl: pr.user?.html_url || "",
        authorAvatar: pr.user?.avatar_url || "",
        url: pr.html_url,
        repo: repoName,
      });
    }

    // AI review runs regardless
    const octokit = await getOctokit(installationId);
    const reviewed = await reviewPR(octokit, repoOwner, repoName, pr);

    return NextResponse.json({ ok: true, notified, reviewed });
  }

  return NextResponse.json({ ok: true, skipped: "Not a handled action" });
}
