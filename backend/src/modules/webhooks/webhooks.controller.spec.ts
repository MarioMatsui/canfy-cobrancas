import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { WebhooksController } from './webhooks.controller';

describe('WebhooksController', () => {
  it('returns explicit HTTP 200 for Asaas webhook delivery', () => {
    const status = Reflect.getMetadata(
      HTTP_CODE_METADATA,
      WebhooksController.prototype.handleWebhook,
    );

    expect(status).toBe(HttpStatus.OK);
  });
});
