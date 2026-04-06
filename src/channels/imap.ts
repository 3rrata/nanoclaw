/**
 * IMAP/SMTP Email Channel for NanoClaw
 *
 * Polls an IMAP inbox for new messages and sends replies via SMTP.
 * Supports any standard IMAP/SMTP provider (Outlook, 163.com, QQ Mail,
 * Gmail with app passwords, custom domains).
 *
 * Configuration is read from ~/.config/imap-smtp-email/.env
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ImapFlow, FetchMessageObject } from 'imapflow';
import nodemailer from 'nodemailer';

import { logger } from '../logger.js';
import {
  buildBoundaryWrappedContent,
  loadSanitizerConfig,
  sanitizeEmailBody,
} from '../email-sanitizer.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

// --- Config parsing ---

interface ImapAccountConfig {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapTls: boolean;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpSecure: boolean;
}

function parseDotEnv(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    result[key] = val;
  }
  return result;
}

function loadConfig(configPath: string): ImapAccountConfig | null {
  if (!fs.existsSync(configPath)) return null;

  const env = parseDotEnv(configPath);

  if (!env.IMAP_HOST || !env.IMAP_USER || !env.IMAP_PASS) {
    logger.warn('IMAP: incomplete configuration in %s', configPath);
    return null;
  }

  return {
    imapHost: env.IMAP_HOST,
    imapPort: parseInt(env.IMAP_PORT || '993', 10),
    imapUser: env.IMAP_USER,
    imapPass: env.IMAP_PASS,
    imapTls: env.IMAP_TLS !== 'false',
    imapMailbox: env.IMAP_MAILBOX || 'INBOX',
    smtpHost: env.SMTP_HOST || env.IMAP_HOST.replace('imap.', 'smtp.'),
    smtpPort: parseInt(env.SMTP_PORT || '587', 10),
    smtpUser: env.SMTP_USER || env.IMAP_USER,
    smtpPass: env.SMTP_PASS || env.IMAP_PASS,
    smtpFrom: env.SMTP_FROM || env.IMAP_USER,
    smtpSecure: env.SMTP_SECURE === 'true',
  };
}

// --- Channel ---

export class ImapChannel implements Channel {
  name = 'imap';

  private config: ImapAccountConfig;
  private opts: {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    registeredGroups: () => Record<string, RegisteredGroup>;
  };
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private processedUids = new Set<string>();
  private messageMeta = new Map<
    string,
    { from: string; fromName: string; subject: string; messageId: string }
  >();
  private consecutiveErrors = 0;
  private smtpTransport: nodemailer.Transporter | null = null;

  constructor(
    config: ImapAccountConfig,
    opts: {
      onMessage: OnInboundMessage;
      onChatMetadata: OnChatMetadata;
      registeredGroups: () => Record<string, RegisteredGroup>;
    },
    pollIntervalMs = 60000,
  ) {
    this.config = config;
    this.opts = opts;
    this.pollIntervalMs = pollIntervalMs;
  }

  async connect(): Promise<void> {
    // Setup SMTP transport
    this.smtpTransport = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
    });

    logger.info(
      {
        host: this.config.imapHost,
        user: this.config.imapUser,
        mailbox: this.config.imapMailbox,
      },
      'IMAP channel connecting',
    );

    // Start polling
    const schedulePoll = () => {
      const backoffMs =
        this.consecutiveErrors > 0
          ? Math.min(
              this.pollIntervalMs * Math.pow(2, this.consecutiveErrors),
              30 * 60 * 1000,
            )
          : this.pollIntervalMs;
      this.pollTimer = setTimeout(async () => {
        try {
          await this.pollForMessages();
        } catch (err) {
          logger.error({ err }, 'IMAP poll error');
        } finally {
          schedulePoll();
        }
      }, backoffMs);
    };

    // Initial poll
    await this.pollForMessages();
    schedulePoll();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.smtpTransport) {
      logger.warn('IMAP: SMTP not initialized');
      return;
    }

    const uid = jid.replace(/^imap:/, '');
    const meta = this.messageMeta.get(uid);

    if (!meta) {
      logger.warn({ jid }, 'IMAP: no metadata for reply');
      return;
    }

    const subject = meta.subject.startsWith('Re:')
      ? meta.subject
      : `Re: ${meta.subject}`;

    try {
      await this.smtpTransport.sendMail({
        from: this.config.smtpFrom,
        to: meta.from,
        subject,
        inReplyTo: meta.messageId,
        references: meta.messageId,
        text,
      });
      logger.info({ to: meta.from, subject }, 'IMAP reply sent');
    } catch (err) {
      logger.error({ jid, err }, 'IMAP: failed to send reply');
    }
  }

  isConnected(): boolean {
    return this.smtpTransport !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('imap:');
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.smtpTransport) {
      this.smtpTransport.close();
      this.smtpTransport = null;
    }
    logger.info('IMAP channel stopped');
  }

  // --- Private ---

  private async pollForMessages(): Promise<void> {
    const client = new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapTls,
      auth: {
        user: this.config.imapUser,
        pass: this.config.imapPass,
      },
      logger: false as any,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(this.config.imapMailbox);

      try {
        // Fetch unread messages
        for await (const message of client.fetch(
          { seen: false },
          {
            uid: true,
            flags: true,
            envelope: true,
            source: true,
          },
        )) {
          await this.processMessage(message);
        }
      } finally {
        lock.release();
      }

      await client.logout();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      logger.error(
        {
          err,
          consecutiveErrors: this.consecutiveErrors,
        },
        'IMAP poll failed',
      );
    }
  }

  private async processMessage(message: FetchMessageObject): Promise<void> {
    const uid = String(message.uid);
    if (this.processedUids.has(uid)) return;
    this.processedUids.add(uid);

    const envelope = message.envelope;
    if (!envelope) return;

    const fromAddr = envelope.from?.[0];
    if (!fromAddr) return;

    const senderEmail = fromAddr.address || '';
    const senderName = fromAddr.name || senderEmail;

    // Skip emails from self
    if (senderEmail === this.config.imapUser) return;

    const subject = envelope.subject || '(no subject)';
    const rfcMessageId = envelope.messageId || '';
    const timestamp = envelope.date
      ? new Date(envelope.date).toISOString()
      : new Date().toISOString();

    // Extract text body from source
    const source = message.source;
    if (!source) {
      logger.debug({ uid, subject }, 'Skipping email with no source');
      return;
    }
    const body = this.extractTextBody(
      typeof source === 'string' ? source : source.toString('utf-8'),
    );

    if (!body) {
      logger.debug({ uid, subject }, 'Skipping email with no text body');
      return;
    }

    const chatJid = `imap:${uid}`;

    // Cache metadata for replies
    this.messageMeta.set(uid, {
      from: senderEmail,
      fromName: senderName,
      subject,
      messageId: rfcMessageId,
    });

    // Store chat metadata
    this.opts.onChatMetadata(chatJid, timestamp, subject, 'imap', false);

    // Find the main group
    const groups = this.opts.registeredGroups();
    const mainEntry = Object.entries(groups).find(([, g]) => g.isMain === true);

    if (!mainEntry) {
      logger.debug(
        { chatJid, subject },
        'No main group registered, skipping email',
      );
      return;
    }

    const mainJid = mainEntry[0];

    // Sanitize email body
    const sanitizerConfig = loadSanitizerConfig();
    const sanitization = sanitizeEmailBody(body, sanitizerConfig);
    const content = buildBoundaryWrappedContent(
      senderName,
      senderEmail,
      subject,
      sanitization.sanitized,
      sanitization.suspicionFlags,
    );

    if (sanitization.suspicionFlags.length > 0) {
      logger.warn(
        {
          uid,
          from: senderEmail,
          subject,
          flags: sanitization.suspicionFlags,
        },
        'IMAP: potential prompt injection detected in email',
      );
    }

    this.opts.onMessage(mainJid, {
      id: uid,
      chat_jid: mainJid,
      sender: senderEmail,
      sender_name: senderName,
      content,
      timestamp,
      is_from_me: false,
    });

    logger.info(
      { mainJid, from: senderName, subject },
      'IMAP email delivered to main group',
    );

    // Cap processed UID set
    if (this.processedUids.size > 5000) {
      const ids = [...this.processedUids];
      this.processedUids = new Set(ids.slice(ids.length - 2500));
    }
  }

  private extractTextBody(rawSource: string): string {
    // Simple MIME text/plain extraction
    const boundaryMatch = rawSource.match(/boundary="?([^"\r\n]+)"?/i);

    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      const parts = rawSource.split(`--${boundary}`);
      for (const part of parts) {
        // Only extract explicit text/plain parts — skip HTML and untyped parts
        if (part.includes('Content-Type: text/plain')) {
          const bodyStart = part.indexOf('\r\n\r\n');
          if (bodyStart !== -1) {
            return part
              .slice(bodyStart + 4)
              .replace(/\r\n$/, '')
              .trim();
          }
        }
      }
      // No text/plain part found in multipart — skip HTML-only emails
      return '';
    }

    // No multipart boundary — check top-level Content-Type before extracting
    const headerEnd = rawSource.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = rawSource.slice(0, headerEnd);
      // Reject if the top-level content type is HTML
      if (/\bContent-Type:\s*text\/html\b/i.test(headers)) {
        return '';
      }
      return rawSource
        .slice(headerEnd + 4)
        .replace(/\r\n$/, '')
        .trim();
    }

    return rawSource.trim();
  }
}

// --- Self-registration ---

registerChannel('imap', (opts: ChannelOpts) => {
  const configDir = path.join(os.homedir(), '.config', 'imap-smtp-email');
  const configPath = path.join(configDir, '.env');

  const config = loadConfig(configPath);
  if (!config) {
    logger.debug('IMAP: no configuration found at %s', configPath);
    return null;
  }

  return new ImapChannel(config, opts);
});
