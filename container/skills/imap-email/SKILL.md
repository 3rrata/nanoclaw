---
name: imap-email
description: Read, search, and send emails via IMAP/SMTP. Use when the user asks to check emails, search inbox, send an email, or manage email messages. Supports multiple accounts.
allowed-tools:
  - Bash
---

# IMAP/SMTP Email Tools

You have access to IMAP and SMTP email tools inside this container. Config is mounted at `~/.config/imap-smtp-email/.env`.

## Available Commands

All commands use the scripts in `/app/src/email/` (these are installed alongside the agent-runner).

### Check for new/unread emails

```bash
node /app/src/email/imap.mjs check [--limit 10] [--mailbox INBOX] [--recent 2h]
```

### Fetch full email by UID

```bash
node /app/src/email/imap.mjs fetch <uid> [--mailbox INBOX]
```

### Search emails

```bash
node /app/src/email/imap.mjs search [--unseen] [--from <addr>] [--subject <text>] [--recent 2h] [--limit 20]
```

### Mark as read/unread

```bash
node /app/src/email/imap.mjs mark-read <uid> [uid2 uid3...]
node /app/src/email/imap.mjs mark-unread <uid> [uid2 uid3...]
```

### List mailboxes

```bash
node /app/src/email/imap.mjs list-mailboxes
```

### Send email

```bash
node /app/src/email/smtp.mjs send --to <addr> --subject <subj> --body <text>
```

Options for send:
- `--html` — send as HTML
- `--cc <addr>` — CC recipients (comma-separated)
- `--bcc <addr>` — BCC recipients
- `--attach <path>` — attach file(s) (comma-separated)
- `--body-file <path>` — read body from file

### Multi-account

Add `--account <name>` before any command to use a named account (prefix in .env).

## When to use

- User asks to check/read emails: use `check` or `search`
- User wants to send an email: use `send`
- User asks about a specific email: use `fetch <uid>`
- User asks to find emails: use `search` with filters

## Important

- NEVER send emails unless the user explicitly asks
- Always confirm recipient and content before sending
- Report errors clearly to the user
