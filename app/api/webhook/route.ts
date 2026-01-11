import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, getOctokit } from "../../../lib/github";
import { reviewPR, checkRateLimit } from "../../../lib/review";

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

  const data = JSON.parse(payload);
  if (data.action !== "opened" && data.action !== "ready_for_review") {
    return NextResponse.json({ ok: true, skipped: "Not PR opened or ready_for_review" });
  }

  const pr = data.pull_request;
  if (!checkRateLimit()) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const octokit = await getOctokit(data.installation.id);
  const reviewed = await reviewPR(octokit, data.repository.owner.login, data.repository.name, pr);

  return NextResponse.json({ ok: true, reviewed });
}
