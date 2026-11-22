import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode } from '@opentelemetry/api';

let sdk: NodeSDK | undefined;

const FORBIDDEN_ATTR_KEYS = [
  'cookie',
  'authorization',
  'email',
  'password',
  'token',
  'refresh',
  'export.body',
  'file.contents',
];

export async function startTelemetry(serviceName: string): Promise<void> {
  if (process.env.OTEL_SDK_DISABLED === 'true') return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
    }),
  });
  await sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}

export function getTracer(name = 'tenantguard') {
  return trace.getTracer(name);
}

export function assertSafeSpanAttributes(
  attrs: Record<string, unknown>,
): void {
  for (const key of Object.keys(attrs)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_ATTR_KEYS.some((f) => lower.includes(f))) {
      throw new Error(`Forbidden telemetry attribute: ${key}`);
    }
  }
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  assertSafeSpanAttributes(attrs);
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      span.setAttributes(attrs);
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
