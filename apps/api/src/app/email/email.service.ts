import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { StructuredLogger } from '../common/structured-logger.service';

export interface SendEmailInput {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey?: string;
}

@Injectable()
export class EmailService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: ConfigService, private readonly logger: StructuredLogger) {
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
      this.logger.error(
        {
          event: 'email.resend.delivery-rejected',
          error: error?.message ?? 'Resend returned no delivery result',
        },
        undefined,
        EmailService.name,
      );
      throw new BadGatewayException('Email delivery failed');
    }

    return { id: data.id };
  }
}
