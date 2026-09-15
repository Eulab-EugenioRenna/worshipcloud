import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY', '');
    this.from = config.get<string>('RESEND_FROM_EMAIL', '');
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    if (!this.apiKey || !this.from) {
      throw new ServiceUnavailableException('Email provider is not configured');
    }

    const resend = new Resend(this.apiKey);
    const { data, error } = await resend.emails.send(
      {
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (error || !data) {
      this.logger.error('Resend rejected an email delivery request', error);
      throw new BadGatewayException('Email delivery failed');
    }

    return { id: data.id };
  }
}
