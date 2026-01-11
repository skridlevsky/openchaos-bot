import { NextRequest, NextResponse } from "next/server";
import { getOctokit, getOpenPRs, getPRComments, listInstallations, PullRequest } from "../../../lib/github";
import { reviewPR, checkRateLimit } from "../../../lib/review";

// Vercel Pro allows up to 60 seconds
export const maxDuration = 60;

const PROCESS_BATCH_SIZE = 5; // Parallel PR reviews
const CHECK_BATCH_SIZE = 15; // Parallel comment checks
const TIMEOUT_MS = 55000; // Stop 5s before max duration

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const timeRemaining = () => TIMEOUT_MS - (Date.now() - startTime);

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    const expectedToken = process.env.BACKFILL_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Config check
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    if (!owner || !repo) {
      return NextResponse.json({ error: "GITHUB_OWNER and GITHUB_REPO must be set" }, { status: 500 });
    }

    // Get installation
    const installations = await listInstallations();
    const installation = installations.find(i => i.account?.login === owner);
    if (!installation) {
      return NextResponse.json({ error: "Bot not installed on repo" }, { status: 400 });
    }

    const octokit = await getOctokit(installation.id);
    const prs = await getOpenPRs(octokit, owner, repo);

    const results: { pr: number; status: string }[] = [];

    // Filter out 0-file PRs and drafts immediately (no API call needed)
    const eligiblePRs = prs.filter(pr => {
      if (pr.changed_files === 0) {
        results.push({ pr: pr.number, status: "skipped: 0 files" });
        return false;
      }
      if (pr.draft) {
        results.push({ pr: pr.number, status: "skipped: draft" });
        return false;
      }
      return true;
    });

    // Check comments in parallel batches to find PRs needing review
    const toProcess: PullRequest[] = [];
    for (let i = 0; i < eligiblePRs.length; i += CHECK_BATCH_SIZE) {
      if (timeRemaining() < 15000) {
        // Not enough time, mark remaining as unchecked
        for (let j = i; j < eligiblePRs.length; j++) {
          results.push({ pr: eligiblePRs[j].number, status: "skipped: timeout before check" });
        }
        break;
      }

      const batch = eligiblePRs.slice(i, i + CHECK_BATCH_SIZE);
      const checks = await Promise.all(
        batch.map(async (pr) => {
          try {
            const comments = await getPRComments(octokit, owner, repo, pr.number);
            const alreadyCommented = comments.some(c => c.body?.includes("OpenChaos Bot"));
            return { pr, alreadyCommented, error: null as string | null };
          } catch (e) {
            return { pr, alreadyCommented: false, error: e instanceof Error ? e.message : "unknown" };
          }
        })
      );

      for (const { pr, alreadyCommented, error } of checks) {
        if (error) {
          results.push({ pr: pr.number, status: `error: ${error}` });
        } else if (alreadyCommented) {
          results.push({ pr: pr.number, status: "skipped: already commented" });
        } else {
          toProcess.push(pr);
        }
      }
    }

    // Early exit if nothing to process
    if (toProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        results,
        summary: {
          total: prs.length,
          reviewed: 0,
          skipped: results.filter(r => r.status.startsWith("skipped")).length,
          errors: results.filter(r => r.status.startsWith("error")).length,
          remaining: 0,
          timeMs: Date.now() - startTime,
        },
      });
    }

    // Check rate limit before processing
    if (!checkRateLimit()) {
      return NextResponse.json({
        ok: false,
        error: "Rate limited (20/hour). Try again later.",
        results,
        needsProcessing: toProcess.length,
      }, { status: 429 });
    }

    // Process eligible PRs in parallel batches with error handling
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < toProcess.length; i += PROCESS_BATCH_SIZE) {
      if (timeRemaining() < 5000) {
        // Mark remaining as needing another run
        for (let j = i; j < toProcess.length; j++) {
          results.push({ pr: toProcess[j].number, status: "pending: timeout" });
        }
        break;
      }

      const batch = toProcess.slice(i, i + PROCESS_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (pr) => {
          try {
            const reviewed = await reviewPR(octokit, owner, repo, pr);
            return { pr: pr.number, status: reviewed ? "reviewed" : "skipped: filtered" };
          } catch (e) {
            return { pr: pr.number, status: `error: ${e instanceof Error ? e.message : "unknown"}` };
          }
        })
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.status === "reviewed") processed++;
        if (result.status.startsWith("error")) errors++;
      }
    }

    const remaining = results.filter(r => r.status.startsWith("pending")).length;

    return NextResponse.json({
      ok: true,
      results,
      summary: {
        total: prs.length,
        reviewed: processed,
        skipped: results.filter(r => r.status.startsWith("skipped")).length,
        errors,
        remaining,
        timeMs: Date.now() - startTime,
      },
      ...(remaining > 0 && { hint: "Run backfill again to process remaining PRs" }),
    });

  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    }, { status: 500 });
  }
}
