import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadEnv } from '../config/env';

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface ActionMailInput {
  to: string;
  displayName: string;
  url: string;
}

function layout(options: {
  heading: string;
  intro: string;
  cta: string;
  url: string;
  footnote: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#2563eb;">Rumindium Invoice</p>
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${options.heading}</h1>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">${options.intro}</p>
          <p style="margin:0 0 26px;">
            <a href="${options.url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:9px;">${options.cta}</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#64748b;">If the button does not work, paste this link into your browser:</p>
          <p style="margin:0 0 22px;font-size:12px;line-height:1.6;word-break:break-all;color:#2563eb;">${options.url}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <p style="margin:0;border-top:1px solid #e2e8f0;padding-top:16px;font-size:11.5px;line-height:1.6;color:#94a3b8;">${options.footnote}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly env = loadEnv();
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = createTransport({
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      secure: this.env.SMTP_SECURE === 'true',
      auth: this.env.SMTP_USER
        ? { user: this.env.SMTP_USER, pass: this.env.SMTP_PASSWORD ?? '' }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async sendVerificationEmail(input: ActionMailInput): Promise<void> {
    await this.send({
      to: input.to,
      subject: 'Activate your Rumindium Invoice account',
      text: `Hi ${input.displayName},\n\nConfirm your email address to activate your Rumindium Invoice account:\n${input.url}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
      html: layout({
        heading: 'Confirm your email address',
        intro: `Hi ${input.displayName}, one click activates your Rumindium Invoice account so you can start issuing invoices.`,
        cta: 'Activate account',
        url: input.url,
        footnote:
          'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
      }),
    });
  }

  async sendPasswordResetEmail(input: ActionMailInput): Promise<void> {
    await this.send({
      to: input.to,
      subject: 'Reset your Rumindium Invoice password',
      text: `Hi ${input.displayName},\n\nChoose a new password for your Rumindium Invoice account:\n${input.url}\n\nThis link expires in 1 hour. If you did not request it, ignore this email.`,
      html: layout({
        heading: 'Reset your password',
        intro: `Hi ${input.displayName}, we received a request to reset the password for your Rumindium Invoice account.`,
        cta: 'Choose a new password',
        url: input.url,
        footnote:
          'This link expires in 1 hour. If you did not request a reset, ignore this email and your password stays the same.',
      }),
    });
  }

  private async send(message: MailMessage): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.env.MAIL_FROM,
      ...message,
    });

    this.logger.log(`Sent "${message.subject}" to ${message.to} (${info.messageId})`);
  }
}
