import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ENV, type Env } from '../config.js';

@Injectable()
export class Mailer {
  private log = new Logger('Mailer');
  /** In tests, messages are captured here instead of sent. */
  readonly outbox: { to: string; subject: string; text: string }[] = [];
  private transport;

  constructor(@Inject(ENV) private env: Env) {
    this.transport =
      env.NODE_ENV === 'test'
        ? null
        : nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
          });
  }

  async send(to: string, subject: string, text: string) {
    if (!this.transport) return void this.outbox.push({ to, subject, text });
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, to, subject, text });
    } catch (e) {
      // Account flows must not fail because SMTP is down; users can resend.
      this.log.error(`Failed to send "${subject}" to ${to}: ${(e as Error).message}`);
    }
  }
}
