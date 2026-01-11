# OpenChaos Bot

> AI-powered PR summaries for [OpenChaos](https://openchaos.dev) — the repo where the internet decides what gets merged.

---

## What it does

When a PR is opened, the bot automatically comments with an AI-generated summary. Example:

```
🤖 OpenChaos Bot

Summary: Adds downvote counting to PR rankings. Net score (👍 minus 👎)
now determines the winner instead of raw upvotes.

Files changed: 3 (getPRs.ts, VoteCount.tsx, README.md)

Impact: High - Core voting logic change. Affects how winners are determined.

---
openchaos-bot
```

Helps voters understand PRs at a glance.

---

## Setup

### 1. Create GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **Name:** `openchaos-bot`
   - **Homepage URL:** `https://openchaos-bot.vercel.app`
   - **Webhook URL:** `https://your-app.vercel.app/api/webhook`
   - **Webhook secret:** Generate one (`openssl rand -hex 32`)
3. **Permissions:**
   - Pull requests: Read & Write
   - Contents: Read
   - Issues: Write (for comments)
4. **Subscribe to events:** Pull request
5. **Create App** and note the **App ID**
6. Generate and download **Private Key**

### 2. Get OpenRouter API Key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up and get a free API key
3. Free tier includes Gemini 2.0 Flash (used by this bot)

### 3. Deploy to Vercel

1. Push this repo to GitHub
2. Import to Vercel
3. Add environment variables:

```
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret
OPENROUTER_API_KEY=your_openrouter_key
BACKFILL_SECRET=your_backfill_secret
GITHUB_OWNER=your_github_username       # For backfill endpoint
GITHUB_REPO=your_repo_name              # For backfill endpoint
```

> **Note:** For the private key, replace newlines with `\n` or use Vercel's multiline value support.

### 4. Install App on Repo

1. Go to your GitHub App settings
2. Click **Install App**
3. Select the repository (e.g., `skridlevsky/openchaos`)

---

## Usage

**Automatic:** Bot comments on new PRs automatically.

**Backfill existing PRs:**
```bash
curl -X POST https://your-app.vercel.app/api/backfill \
  -H "Authorization: Bearer your_backfill_secret"
```

---

## Safety & Limits

| Rule | Why |
|------|-----|
| Max 20 reviews/hour | Prevent spam |
| Skip PRs with 0 files | No empty PRs |
| Skip draft PRs | Wait until ready for review |
| Truncate diffs > 500 lines | LLM context limits |

---

## How it works

```
PR opened → GitHub webhook → Fetch diff → Generate summary → Post comment
```

---

## Credits

- **LLM:** [OpenRouter](https://openrouter.ai) — Gemini 2.0 Flash (free tier)
- **Built for:** [OpenChaos](https://openchaos.dev) — a self-evolving open source project

---

## License

MIT
