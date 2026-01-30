const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

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

export async function notifyMerge(pr: MergedPR): Promise<boolean> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn("DISCORD_WEBHOOK_URL not set, skipping Discord notification");
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
    color: 0x34d399, // emerald-400 — matches feed.openchaos.dev
    footer: {
      text: pr.repo,
    },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    console.error(`Discord webhook failed: ${res.status} ${await res.text()}`);
    return false;
  }

  return true;
}
