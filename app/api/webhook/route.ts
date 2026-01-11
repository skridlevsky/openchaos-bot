import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, getOctokit } from "../../../lib/github";
import { reviewPR } from "../../../lib/review";

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

  if (data.action !== "opened" && data.action !== "ready_for_review") {
    return NextResponse.json({ ok: true, skipped: "Not PR opened or ready_for_review" });
  }

  const pr = data.pull_request;
  const installationId = data.installation?.id;
  const repoOwner = data.repository?.owner?.login;
  const repoName = data.repository?.name;

  if (!pr || !installationId || !repoOwner || !repoName) {
    return NextResponse.json({ error: "Missing required fields in payload" }, { status: 400 });
  }

  const octokit = await getOctokit(installationId);
  const reviewed = await reviewPR(octokit, repoOwner, repoName, pr);

  return NextResponse.json({ ok: true, reviewed });
}
