import { Injectable } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { context, propagation } from '@opentelemetry/api';

@Injectable()
export class SqsService {
  private client: SQSClient | null = null;
  private queueUrl =
    process.env.SQS_EXPORTS_QUEUE_URL ??
    'http://localhost:9324/queue/tenantguard-exports';

  constructor() {
    if (process.env.SQS_ENDPOINT || process.env.SQS_EXPORTS_QUEUE_URL) {
      this.client = new SQSClient({
        region: process.env.SQS_REGION ?? 'us-east-1',
        endpoint: process.env.SQS_ENDPOINT,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
        },
      });
    }
  }

  isEnabled(): boolean {
    return !!this.client;
  }

  async enqueueExport(jobId: string, tenantId: string): Promise<void> {
    if (!this.client) return;

    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    const messageAttributes: Record<
      string,
      { DataType: string; StringValue: string }
    > = {};
    if (carrier.traceparent) {
      messageAttributes.traceparent = {
        DataType: 'String',
        StringValue: carrier.traceparent,
      };
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({ jobId, tenantId }),
        ...(Object.keys(messageAttributes).length
          ? { MessageAttributes: messageAttributes }
          : {}),
      }),
    );
  }
}
