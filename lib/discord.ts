const DISCORD_WEBHOOK_LOG = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_WEBHOOK_PROPOSALS = process.env.DISCORD_WEBHOOK_URL_PROPOSALS;

interface MergedPR {
  number: number;
  title: string;
  author: string;
  authorUrl: string;
  authorAvatar: string;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  repo: string;
}

interface NewPR {
  number: number;
  title: string;
  body: string;
  author: string;
  authorUrl: string;
  authorAvatar: string;
  url: string;
  repo: string;
}

interface NewIssue {
  number: number;
  title: string;
  body: string;
  author: string;
  authorUrl: string;
  authorAvatar: string;
  url: string;
  repo: string;
  labels: string[];
}

async function postToWebhook(webhookUrl: string, payload: object): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Discord webhook failed: ${res.status} ${await res.text()}`);
    return false;
  }

  return true;
}

export async function notifyMerge(pr: MergedPR): Promise<boolean> {
  if (!DISCORD_WEBHOOK_LOG) {
    console.warn("DISCORD_WEBHOOK_URL not set, skipping merge notification");
    return false;
  }

  const embed = {
    author: {
      name: pr.author,
      icon_url: pr.authorAvatar,
      url: pr.authorUrl,
    },
    title: `#${pr.number} ${pr.title}`,
    url: pr.url,
    description: `merged \u00b7 +${pr.additions} -${pr.deletions} \u00b7 ${pr.changedFiles} file${pr.changedFiles !== 1 ? "s" : ""}`,
    color: 0x34d399, // emerald-400
    footer: { text: pr.repo },
    timestamp: new Date().toISOString(),
  };

  return postToWebhook(DISCORD_WEBHOOK_LOG, { embeds: [embed] });
}

export async function notifyNewPR(pr: NewPR): Promise<boolean> {
  if (!DISCORD_WEBHOOK_PROPOSALS) {
    console.warn("DISCORD_WEBHOOK_URL_PROPOSALS not set, skipping PR notification");
    return false;
  }

  const description = pr.body
    ? pr.body.slice(0, 300) + (pr.body.length > 300 ? "\u2026" : "")
    : "*No description provided.*";

  const embed = {
    author: {
      name: pr.author,
      icon_url: pr.authorAvatar,
      url: pr.authorUrl,
    },
    title: `PR #${pr.number}: ${pr.title}`,
    url: pr.url,
    description,
    color: 0x3b82f6, // blue-500
    footer: { text: pr.repo },
    timestamp: new Date().toISOString(),
  };

  return postToWebhook(DISCORD_WEBHOOK_PROPOSALS, { embeds: [embed] });
}

export async function notifyNewIssue(issue: NewIssue): Promise<boolean> {
  if (!DISCORD_WEBHOOK_PROPOSALS) {
    console.warn("DISCORD_WEBHOOK_URL_PROPOSALS not set, skipping issue notification");
    return false;
  }

  let description = issue.body
    ? issue.body.slice(0, 300) + (issue.body.length > 300 ? "\u2026" : "")
    : "*No description provided.*";

  if (issue.labels.length > 0) {
    description += `\n\n${issue.labels.map((l) => `\`${l}\``).join(" ")}`;
  }

  const embed = {
    author: {
      name: issue.author,
      icon_url: issue.authorAvatar,
      url: issue.authorUrl,
    },
    title: `Issue #${issue.number}: ${issue.title}`,
    url: issue.url,
    description,
    color: 0x8b5cf6, // violet-500
    footer: { text: issue.repo },
    timestamp: new Date().toISOString(),
  };

  return postToWebhook(DISCORD_WEBHOOK_PROPOSALS, { embeds: [embed] });
}
