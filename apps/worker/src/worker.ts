import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { context, propagation, trace, SpanStatusCode } from '@opentelemetry/api';
import { getPool, withTenantTransaction } from '@tenantguard/db';

type ExportMessage = { jobId: string; tenantId: string };

export async function startWorker(): Promise<() => void> {
  const client = new SQSClient({
    region: process.env.SQS_REGION ?? 'us-east-1',
    endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:9324',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
    },
  });

  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    },
  });

  const queueUrl =
    process.env.SQS_EXPORTS_QUEUE_URL ??
    'http://localhost:9324/queue/tenantguard-exports';
  const bucket = process.env.S3_BUCKET ?? 'tenantguard-exports';
  let running = true;

  const loop = (async () => {
    while (running) {
      try {
        const response = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 5,
            WaitTimeSeconds: 5,
            MessageAttributeNames: ['All'],
          }),
        );

        for (const message of response.Messages ?? []) {
          const body = JSON.parse(message.Body ?? '{}') as ExportMessage;
          const carrier = {
            traceparent:
              message.MessageAttributes?.traceparent?.StringValue ?? '',
          };
          const extracted = propagation.extract(context.active(), carrier);
          const tracer = trace.getTracer('tenantguard-worker');

          await tracer.startActiveSpan(
            'worker.process_export',
            {},
            extracted,
            async (span) => {
              try {
                span.setAttributes({
                  'job.id': body.jobId,
                  'tenant.id': body.tenantId,
                });
                await processExport(body, s3, bucket);
                if (message.ReceiptHandle) {
                  await client.send(
                    new DeleteMessageCommand({
                      QueueUrl: queueUrl,
                      ReceiptHandle: message.ReceiptHandle,
                    }),
                  );
                }
                span.setStatus({ code: SpanStatusCode.OK });
              } catch (error) {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message:
                    error instanceof Error ? error.message : 'worker error',
                });
                throw error;
              } finally {
                span.end();
              }
            },
          );
        }
      } catch (error) {
        console.error('worker loop error', error);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();

  return () => {
    running = false;
    void loop;
  };
}

export async function processExport(
  message: ExportMessage,
  s3: S3Client,
  bucket: string,
): Promise<void> {
  const claimed = await withTenantTransaction(
    { userId: '00000000-0000-0000-0000-000000000000', tenantId: message.tenantId },
    async (client) => {
      const result = await client.query<{
        id: string;
        tenant_id: string;
        format: string;
        status: string;
      }>(
        `
        UPDATE export_jobs
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            updated_at = now()
        WHERE id = $1
          AND tenant_id = $2
          AND status = 'pending'
        RETURNING id, tenant_id, format, status
        `,
        [message.jobId, message.tenantId],
      );
      return result.rows[0] ?? null;
    },
  );

  if (!claimed) {
    // Already processed or wrong tenant visibility under RLS.
    const visible = await withTenantTransaction(
      {
        userId: '00000000-0000-0000-0000-000000000000',
        tenantId: message.tenantId,
      },
      async (client) => {
        const result = await client.query(
          `SELECT id, tenant_id, status FROM export_jobs WHERE id = $1`,
          [message.jobId],
        );
        return result.rows[0] ?? null;
      },
    );

    if (!visible) {
      await getPool().query(
        `
        INSERT INTO audit_logs (tenant_id, action, resource_type, resource_id, metadata)
        SELECT $1, 'export.tampered_drop', 'export_job', $2, $3::jsonb
        WHERE EXISTS (SELECT 1 FROM tenants WHERE id = $1)
        `,
        [
          message.tenantId,
          message.jobId,
          JSON.stringify({ reason: 'job_not_visible_under_rls' }),
        ],
      ).catch(() => undefined);
    }
    return;
  }

  const csv = await withTenantTransaction(
    {
      userId: '00000000-0000-0000-0000-000000000000',
      tenantId: message.tenantId,
    },
    async (client) => {
      const projects = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM projects ORDER BY created_at`,
      );
      const lines = ['id,name', ...projects.rows.map((p) => `${p.id},${escapeCsv(p.name)}`)];
      return lines.join('\n');
    },
  );

  const objectKey = `exports/${message.tenantId}/${message.jobId}.csv`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: csv,
      ContentType: 'text/csv',
    }),
  );

  await withTenantTransaction(
    {
      userId: '00000000-0000-0000-0000-000000000000',
      tenantId: message.tenantId,
    },
    async (client) => {
      await client.query(
        `
        UPDATE export_jobs
        SET status = 'completed',
            object_key = $2,
            completed_at = now(),
            updated_at = now()
        WHERE id = $1 AND status = 'processing'
        `,
        [message.jobId, objectKey],
      );
    },
  );
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
