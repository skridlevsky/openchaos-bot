import { App, Octokit } from "octokit";
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
type OctokitInstance = any;

let _app: App | null = null;

function getApp(): App {
  if (!_app) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyRaw = process.env.GITHUB_PRIVATE_KEY;

    if (!appId) throw new Error("GITHUB_APP_ID is not set");
    if (!privateKeyRaw) throw new Error("GITHUB_PRIVATE_KEY is not set");

    // Handle both escaped \n and actual newlines in private key
    let privateKey = privateKeyRaw;
    if (privateKey.includes("\\n")) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    _app = new App({ appId, privateKey, Octokit });
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

export async function getOctokit(installationId: number): Promise<OctokitInstance> {
  return getApp().getInstallationOctokit(installationId);
}

export async function getPRDiff(octokit: OctokitInstance, owner: string, repo: string, prNumber: number): Promise<string> {
  const { data } = await octokit.rest.pulls.get({
    owner, repo, pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function getOpenPRs(octokit: OctokitInstance, owner: string, repo: string): Promise<PullRequest[]> {
  const { data } = await octokit.rest.pulls.list({ owner, repo, state: "open" });
  return data;
}

export async function getPRComments(octokit: OctokitInstance, owner: string, repo: string, prNumber: number): Promise<Comment[]> {
  const { data } = await octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber });
  return data;
}

export async function postComment(octokit: OctokitInstance, owner: string, repo: string, prNumber: number, body: string): Promise<void> {
  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
}

export async function listInstallations() {
  const { data } = await getApp().octokit.request("GET /app/installations");
  return data;
}

export async function getCIStatus(octokit: OctokitInstance, owner: string, repo: string, sha: string): Promise<"success" | "failure" | "pending"> {
  const { data } = await octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: sha });
  if (data.state === "failure" || data.state === "error") return "failure";
  if (data.state === "success") return "success";
  return "pending";
}
