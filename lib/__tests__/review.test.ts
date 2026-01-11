import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("../github", () => ({
  getPRDiff: vi.fn(),
  postComment: vi.fn(),
  PullRequest: {},
}));

vi.mock("../openrouter", () => ({
  generateSummary: vi.fn(),
}));

import { checkRateLimit, reviewPR } from "../review";
import { getPRDiff, postComment } from "../github";
import { generateSummary } from "../openrouter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset module state by re-importing (rate limit map is module-scoped)
    vi.resetModules();
  });

  it("returns true when under limit", async () => {
    const { checkRateLimit } = await import("../review");
    expect(checkRateLimit()).toBe(true);
  });
});

describe("reviewPR", () => {
  const mockOctokit = {};
  const mockPR = { number: 1, state: "open", changed_files: 3 };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for closed PR", async () => {
    const closedPR = { ...mockPR, state: "closed" };
    const result = await reviewPR(mockOctokit, "owner", "repo", closedPR);
    expect(result).toBe(false);
    expect(getPRDiff).not.toHaveBeenCalled();
  });

  it("returns false for PR with 0 files", async () => {
    const emptyPR = { ...mockPR, changed_files: 0 };
    const result = await reviewPR(mockOctokit, "owner", "repo", emptyPR);
    expect(result).toBe(false);
    expect(getPRDiff).not.toHaveBeenCalled();
  });

  it("fetches diff, generates summary, and posts comment", async () => {
    vi.mocked(getPRDiff).mockResolvedValue("line1\nline2\nline3");
    vi.mocked(generateSummary).mockResolvedValue(
      "SUMMARY: Test summary\nFILES: 3 (a.ts, b.ts)\nIMPACT: Low - Minor change"
    );
    vi.mocked(postComment).mockResolvedValue(undefined);

    const result = await reviewPR(mockOctokit, "owner", "repo", mockPR);

    expect(result).toBe(true);
    expect(getPRDiff).toHaveBeenCalledWith(mockOctokit, "owner", "repo", 1);
    expect(generateSummary).toHaveBeenCalledWith("line1\nline2\nline3", false);
    expect(postComment).toHaveBeenCalled();

    const commentArg = vi.mocked(postComment).mock.calls[0][4];
    expect(commentArg).toContain("OpenChaos Bot");
    expect(commentArg).toContain("Test summary");
  });

  it("truncates large diffs and sets truncated flag", async () => {
    const largeDiff = Array(600).fill("line").join("\n");
    vi.mocked(getPRDiff).mockResolvedValue(largeDiff);
    vi.mocked(generateSummary).mockResolvedValue("SUMMARY: Big\nFILES: 10\nIMPACT: High");
    vi.mocked(postComment).mockResolvedValue(undefined);

    await reviewPR(mockOctokit, "owner", "repo", mockPR);

    const [diff, truncated] = vi.mocked(generateSummary).mock.calls[0];
    expect(diff.split("\n").length).toBe(500);
    expect(truncated).toBe(true);

    const comment = vi.mocked(postComment).mock.calls[0][4];
    expect(comment).toContain("Large PR - partial review");
  });

  it("handles missing summary fields gracefully", async () => {
    vi.mocked(getPRDiff).mockResolvedValue("diff");
    vi.mocked(generateSummary).mockResolvedValue("Just some text without format");
    vi.mocked(postComment).mockResolvedValue(undefined);

    const result = await reviewPR(mockOctokit, "owner", "repo", mockPR);
    expect(result).toBe(true);

    const comment = vi.mocked(postComment).mock.calls[0][4];
    expect(comment).toContain("OpenChaos Bot");
  });
});
