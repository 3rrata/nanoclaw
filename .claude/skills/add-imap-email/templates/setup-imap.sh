#!/usr/bin/env bash
# Setup script for IMAP/SMTP email configuration
# Run interactively: bash setup.sh
# Non-interactive:  bash setup.sh --non-interactive

set -euo pipefail

CONFIG_DIR="$HOME/.config/imap-smtp-email"
CONFIG_FILE="$CONFIG_DIR/.env"

mkdir -p "$CONFIG_DIR"

# Provider defaults
declare -A IMAP_HOSTS SMTP_HOSTS IMAP_PORTS SMTP_PORTS
IMAP_HOSTS=([gmail]=imap.gmail.com [outlook]=outlook.office365.com [163]=imap.163.com [qq]=imap.qq.com [yahoo]=imap.mail.yahoo.com [custom]="")
SMTP_HOSTS=([gmail]=smtp.gmail.com [outlook]=smtp.office365.com [163]=smtp.163.com [qq]=smtp.qq.com [yahoo]=smtp.mail.yahoo.com [custom]="")
IMAP_PORTS=([gmail]=993 [outlook]=993 [163]=993 [qq]=993 [yahoo]=993 [custom]=993)
SMTP_PORTS=([gmail]=587 [outlook]=587 [163]=465 [qq]=587 [yahoo]=587 [custom]=587)

show_providers() {
  echo "Available providers:"
  echo "  1) Gmail (requires App Password)"
  echo "  2) Outlook / Office 365"
  echo "  3) 163.com (requires authorization code)"
  echo "  4) QQ Mail (requires authorization code)"
  echo "  5) Yahoo (requires App Password)"
  echo "  6) Custom IMAP/SMTP server"
}

write_config() {
  local prefix="${1:-}"
  local imap_host="$2" imap_port="$3" imap_user="$4" imap_pass="$5"
  local imap_tls="$6" imap_mailbox="$7"
  local smtp_host="$8" smtp_port="$9" smtp_user="${10}" smtp_pass="${11}"
  local smtp_from="${12}" smtp_secure="${13}"

  cat >> "$CONFIG_FILE" <<EOF
${prefix:+# Account: ${prefix#_}}
${prefix}IMAP_HOST=${imap_host}
${prefix}IMAP_PORT=${imap_port}
${prefix}IMAP_USER=${imap_user}
${prefix}IMAP_PASS=${imap_pass}
${prefix}IMAP_TLS=${imap_tls}
${prefix}IMAP_MAILBOX=${imap_mailbox}
${prefix}SMTP_HOST=${smtp_host}
${prefix}SMTP_PORT=${smtp_port}
${prefix}SMTP_USER=${smtp_user}
${prefix}SMTP_PASS=${smtp_pass}
${prefix}SMTP_FROM=${smtp_from}
${prefix}SMTP_SECURE=${smtp_secure}

EOF

  chmod 600 "$CONFIG_FILE"
}

echo "=== IMAP/SMTP Email Setup ==="
echo ""

if [ -f "$CONFIG_FILE" ]; then
  echo "Existing configuration found at $CONFIG_FILE"
  read -rp "Add a new account? (y/N): " add_account
  if [[ ! "$add_account" =~ ^[Yy]$ ]]; then
    echo "Keeping existing configuration."
    exit 0
  fi
  echo ""
fi

show_providers
read -rp "Choose provider (1-6): " choice

case "$choice" in
  1) provider="gmail" ;;
  2) provider="outlook" ;;
  3) provider="163" ;;
  4) provider="qq" ;;
  5) provider="yahoo" ;;
  6) provider="custom" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

if [ "$provider" = "custom" ]; then
  read -rp "IMAP host: " imap_host
  read -rp "IMAP port [993]: " imap_port
  imap_port="${imap_port:-993}"
  read -rp "SMTP host: " smtp_host
  read -rp "SMTP port [587]: " smtp_port
  smtp_port="${smtp_port:-587}"
else
  imap_host="${IMAP_HOSTS[$provider]}"
  imap_port="${IMAP_PORTS[$provider]}"
  smtp_host="${SMTP_HOSTS[$provider]}"
  smtp_port="${SMTP_PORTS[$provider]}"
fi

read -rp "Email address: " email
read -rsp "Password/App password: " password
echo ""

if [ "$provider" = "gmail" ]; then
  echo ""
  echo "Note: Gmail requires an App Password, not your regular password."
  echo "Generate one at: https://myaccount.google.com/apppasswords"
fi

if [ "$provider" = "163" ] || [ "$provider" = "qq" ]; then
  echo ""
  echo "Note: Use your authorization code, not your regular password."
fi

read -rp "Is this an additional account? (y/N): " is_additional
if [[ "$is_additional" =~ ^[Yy]$ ]]; then
  read -rp "Account name (lowercase, letters/digits): " account_name
  prefix="$(echo "$account_name" | tr '[:lower:]' '[:upper:]')_"
else
  prefix=""
fi

# Start fresh if default account
if [ -z "$prefix" ] && [ ! -f "$CONFIG_FILE" ]; then
  : > "$CONFIG_FILE"
fi

write_config \
  "$prefix" \
  "$imap_host" "$imap_port" "$email" "$password" \
  "true" "INBOX" \
  "$smtp_host" "$smtp_port" "$email" "$password" \
  "$email" "$([ "$smtp_port" = "465" ] && echo true || echo false)"

echo ""
echo "Configuration saved to $CONFIG_FILE"
echo ""
echo "Test connection:"
echo "  node /app/src/email/imap.mjs check --limit 1"
