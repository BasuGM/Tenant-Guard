import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CreateExportInput } from '@tenantguard/shared';
import { DatabaseService } from '../database/database.service';
import { SqsService } from './sqs.service';
import { withSpan } from '../telemetry/telemetry';

@Injectable()
export class ExportsService {
  private s3: S3Client | null = null;
  private bucket = process.env.S3_BUCKET ?? 'tenantguard-exports';

  constructor(
    private readonly database: DatabaseService,
    private readonly sqs: SqsService,
  ) {
    if (process.env.S3_ENDPOINT || process.env.S3_BUCKET) {
      this.s3 = new S3Client({
        region: process.env.S3_REGION ?? 'us-east-1',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
        },
      });
    }
  }

  async create(
    userId: string,
    tenantId: string | null,
    input: CreateExportInput,
    idempotencyKey?: string,
  ) {
    if (!tenantId) throw new NotFoundException();

    return withSpan(
      'exports.create',
      { 'tenant.id': tenantId, 'user.id': userId },
      async () => {
        const job = await this.database.withTenantTransaction(
          { userId, tenantId },
          async (client) => {
            if (idempotencyKey) {
              const existing = await client.query(
                `
                SELECT * FROM export_jobs
                WHERE tenant_id = $1 AND idempotency_key = $2
                `,
                [tenantId, idempotencyKey],
              );
              if (existing.rows[0]) return existing.rows[0];
            }

            const inserted = await client.query(
              `
              INSERT INTO export_jobs
                (tenant_id, requested_by, format, status, idempotency_key)
              VALUES ($1, $2, $3, 'pending', $4)
              RETURNING *
              `,
              [tenantId, userId, input.format, idempotencyKey ?? null],
            );
            return inserted.rows[0];
          },
        );

        await withSpan(
          'exports.enqueue',
          { 'tenant.id': tenantId, 'job.id': String(job.id) },
          async () => {
            await this.sqs.enqueueExport(String(job.id), tenantId);
          },
        );

        return job;
      },
    );
  }

  async get(userId: string, tenantId: string | null, jobId: string) {
    if (!tenantId) throw new NotFoundException();
    return this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `SELECT * FROM export_jobs WHERE id = $1`,
          [jobId],
        );
        const row = result.rows[0];
        if (!row) throw new NotFoundException();
        return row;
      },
    );
  }

  async list(userId: string, tenantId: string | null) {
    if (!tenantId) throw new NotFoundException();
    return this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `SELECT * FROM export_jobs ORDER BY created_at DESC LIMIT 50`,
        );
        return result.rows;
      },
    );
  }

  async downloadUrl(userId: string, tenantId: string | null, jobId: string) {
    const job = await this.get(userId, tenantId, jobId);
    if (job.status !== 'completed' || !job.object_key) {
      throw new NotFoundException();
    }
    if (!this.s3) {
      throw new ServiceUnavailableException('Object storage unavailable');
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: job.object_key,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 60 });
    return { url, expiresIn: 60 };
  }
}
