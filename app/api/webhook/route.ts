import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, getOctokit } from "../../../lib/github";
import { reviewPR } from "../../../lib/review";
import { notifyMerge } from "../../../lib/discord";

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  if (!await verifyWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, skipped: "Not a PR event" });
  }

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const pr = data.pull_request;
  const installationId = data.installation?.id;
  const repoOwner = data.repository?.owner?.login;
  const repoName = data.repository?.name;

  if (!pr || !installationId || !repoOwner || !repoName) {
    return NextResponse.json({ error: "Missing required fields in payload" }, { status: 400 });
  }

  // PR merged — notify Discord
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

  // PR opened/ready — generate review
  if (data.action !== "opened" && data.action !== "ready_for_review") {
    return NextResponse.json({ ok: true, skipped: "Not a handled action" });
  }

  const octokit = await getOctokit(installationId);
  const reviewed = await reviewPR(octokit, repoOwner, repoName, pr);

  return NextResponse.json({ ok: true, reviewed });
}
