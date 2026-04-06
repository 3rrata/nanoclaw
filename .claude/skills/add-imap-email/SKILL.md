---
name: add-imap-email
description: Add IMAP/SMTP email integration to NanoClaw. Supports any standard email provider (Outlook, 163.com, QQ Mail, Gmail with app passwords, etc.). Can be configured as a channel (incoming emails trigger the agent) or tool-only (agent reads/sends emails on demand). Multi-account support included.
---

# Add IMAP/SMTP Email Integration

This skill adds generic IMAP/SMTP email support to NanoClaw for providers not covered by the Gmail OAuth channel — Outlook, 163.com, QQ Mail, Yahoo, custom domains, or Gmail with app passwords. Supports multiple accounts.

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/imap.ts` exists. If it does, skip to Phase 3 (Setup).

### Ask the user

Use `AskUserQuestion`:

AskUserQuestion: Should incoming emails be able to trigger the agent?

- **Yes** — Full channel mode: the agent polls the inbox and responds to incoming emails automatically
- **No** — Tool-only: the agent gets IMAP/SMTP tools inside the container but won't monitor the inbox

Also ask which email provider they're using (needed for default server settings).

## Phase 2: Apply Code Changes

### Install dependencies

```bash
npm install imapflow nodemailer
```

### Create the IMAP channel

Create `src/channels/imap.ts` based on the template at `${CLAUDE_SKILL_DIR}/templates/imap-channel.ts`. The channel:
- Polls the inbox via IMAP (using `imapflow`) at a configurable interval
- Sends replies via SMTP (using `nodemailer`)
- Self-registers via `registerChannel('imap', ...)` from `./registry.js`
- Detects config from environment variables (`IMAP_*` / `SMTP_*`)

### Create the email sanitizer integration

The channel reuses the existing `src/email-sanitizer.ts` module (same as Gmail) for prompt injection protection on incoming emails.

### Register the channel

Append to `src/channels/index.ts`:

```typescript
// imap
import './imap.js';
```

### Add IMAP/SMTP container tools

Create container skill at `container/skills/imap-email/SKILL.md` based on the template at `${CLAUDE_SKILL_DIR}/templates/container-skill.md`. This gives the agent inside the container IMAP/SMTP read/send tools.

### Add credential mount to container-runner

In `src/container-runner.ts`, add a mount for IMAP config (after the Gmail mount block around line 190):

```typescript
// IMAP/SMTP credentials directory
const imapConfigDir = path.join(homeDir, '.config', 'imap-smtp-email');
if (fs.existsSync(imapConfigDir)) {
  mounts.push({
    hostPath: imapConfigDir,
    containerPath: '/home/node/.config/imap-smtp-email',
    readonly: false,
  });
}
```

### Validate code changes

```bash
npm install
npm run build
```

Build must be clean before proceeding.

## Phase 3: Setup

### Create configuration directory

```bash
mkdir -p ~/.config/imap-smtp-email
```

### Collect credentials

Use `AskUserQuestion` to collect:

1. **Email provider** — use defaults from the table below
2. **Email address** — used as both IMAP_USER and SMTP_USER
3. **Password** — app password / authorization code (NOT regular password)

Common server settings:

| Provider | IMAP Host | IMAP Port | SMTP Host | SMTP Port | Notes |
|----------|-----------|-----------|-----------|-----------|-------|
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 587 | App password required |
| Outlook | outlook.office365.com | 993 | smtp.office365.com | 587 | |
| 163.com | imap.163.com | 993 | smtp.163.com | 465 | Authorization code |
| QQ Mail | imap.qq.com | 993 | smtp.qq.com | 587 | Authorization code |
| Yahoo | imap.mail.yahoo.com | 993 | smtp.mail.yahoo.com | 587 | App password |
| Custom | (user provides) | 993 | (user provides) | 587/465 | |

### Write config file

Write `~/.config/imap-smtp-email/.env`:

```
IMAP_HOST=<imap-host>
IMAP_PORT=993
IMAP_USER=<email>
IMAP_PASS=<password>
IMAP_TLS=true
IMAP_MAILBOX=INBOX
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<password>
SMTP_FROM=<email>
SMTP_SECURE=false
```

Set permissions:

```bash
chmod 600 ~/.config/imap-smtp-email/.env
```

### Add email handling instructions (Channel mode only)

If the user chose channel mode, append to `groups/main/CLAUDE.md` (before the formatting section):

```markdown
## Email Notifications (IMAP)

When you receive an email notification (messages starting with `[Email from ...`), inform the user about it but do NOT reply to the email unless specifically asked. You have IMAP/SMTP tools available — use them only when the user explicitly asks you to reply, forward, or take action on an email.
```

### Build and restart

Clear stale per-group agent-runner copies:

```bash
rm -r data/sessions/*/agent-runner-src 2>/dev/null || true
```

Rebuild the container and restart:

```bash
cd container && ./build.sh && cd ..
npm run build
# Linux:
systemctl --user restart nanoclaw
# macOS:
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 4: Verify

### Test tool access (both modes)

Tell the user:

> IMAP/SMTP is connected! Send this in your main channel:
>
> `@Andy check my recent emails` or `@Andy search emails from someone@example.com`

### Test channel mode (Channel mode only)

Tell the user to send themselves a test email. The agent should pick it up within the polling interval (default 60s). Monitor: `tail -f logs/nanoclaw.log | grep -iE "(imap|email)"`.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log
```

## Multi-Account

Additional accounts can be added to the same config file using a name prefix:

```
# Work account (WORK_ prefix)
WORK_IMAP_HOST=imap.company.com
WORK_IMAP_PORT=993
WORK_IMAP_USER=me@company.com
WORK_IMAP_PASS=password
WORK_IMAP_TLS=true
WORK_IMAP_MAILBOX=INBOX
WORK_SMTP_HOST=smtp.company.com
WORK_SMTP_PORT=587
WORK_SMTP_USER=me@company.com
WORK_SMTP_PASS=password
WORK_SMTP_FROM=me@company.com
```

The channel currently monitors the default (unprefixed) account. Multi-account channel monitoring requires separate channel instances (one per account).

## Troubleshooting

### Connection timeout

- Verify server host and port
- Test from command line: `openssl s_client -connect imap.gmail.com:993`
- Some corporate networks block IMAP — try from a different network

### Authentication failed

- Gmail: must use an **App Password** (not regular password) — generate at https://myaccount.google.com/apppasswords
- 163.com: must use **authorization code** (授权码), not account password
- Outlook: may need to enable IMAP in Outlook settings

### Emails not detected (Channel mode)

- Check the IMAP_MAILBOX setting — must match the actual folder name
- Verify the account has unread emails
- Check logs for IMAP connection errors

### Container can't access config

- Verify `~/.config/imap-smtp-email/` is mounted: check `src/container-runner.ts` for the mount
- Check container logs: `cat groups/main/logs/container-*.log | tail -50`

## Removal

### Tool-only mode

1. Remove `~/.config/imap-smtp-email` mount from `src/container-runner.ts`
2. Remove `container/skills/imap-email/` directory
3. Uninstall: `npm uninstall imapflow nodemailer`
4. Rebuild and restart

### Channel mode

1. Delete `src/channels/imap.ts`
2. Remove `import './imap.js'` from `src/channels/index.ts`
3. Remove `~/.config/imap-smtp-email` mount from `src/container-runner.ts`
4. Remove `container/skills/imap-email/` directory
5. Uninstall: `npm uninstall imapflow nodemailer`
6. Rebuild: `cd container && ./build.sh && cd .. && npm run build`
7. Restart: `systemctl --user restart nanoclaw` (Linux) or `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` (macOS)
