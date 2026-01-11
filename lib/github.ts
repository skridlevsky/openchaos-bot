import { App } from "@octokit/app";
import crypto from "crypto";

export interface PullRequest {
  number: number;
  state: string;
  changed_files: number;
  draft?: boolean;
  head?: { sha: string };
}

interface Comment {
  body?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Octokit = any;

let _app: App | null = null;

function getApp(): App {
  if (!_app) {
    _app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    });
  }
  return _app;
}

export async function verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
  const expected = "sha256=" + crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
    .update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export async function getOctokit(installationId: number): Promise<Octokit> {
  return getApp().getInstallationOctokit(installationId);
}

export async function getPRDiff(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<string> {
  const { data } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function getOpenPRs(octokit: Octokit, owner: string, repo: string): Promise<PullRequest[]> {
  const { data } = await octokit.rest.pulls.list({ owner, repo, state: "open" });
  return data;
}

export async function getPRComments(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<Comment[]> {
  const { data } = await octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber });
  return data;
}

export async function postComment(octokit: Octokit, owner: string, repo: string, prNumber: number, body: string): Promise<void> {
  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
}

export async function listInstallations() {
  const { data } = await getApp().octokit.request("GET /app/installations");
  return data;
}

export async function getCIStatus(octokit: Octokit, owner: string, repo: string, sha: string): Promise<"success" | "failure" | "pending"> {
  const { data } = await octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: sha });
  if (data.state === "failure" || data.state === "error") return "failure";
  if (data.state === "success") return "success";
  return "pending";
}
