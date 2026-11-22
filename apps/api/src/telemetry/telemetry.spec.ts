import { assertSafeSpanAttributes } from './telemetry';

describe('telemetry attribute safety', () => {
  it('allows tenant and job ids', () => {
    expect(() =>
      assertSafeSpanAttributes({
        'tenant.id': 't1',
        'user.id': 'u1',
        'job.id': 'j1',
      }),
    ).not.toThrow();
  });

  it('rejects cookie and email attributes', () => {
    expect(() => assertSafeSpanAttributes({ cookie: 'x' })).toThrow(
      /Forbidden telemetry attribute/,
    );
    expect(() => assertSafeSpanAttributes({ 'user.email': 'a@b.c' })).toThrow(
      /Forbidden telemetry attribute/,
    );
    expect(() =>
      assertSafeSpanAttributes({ authorization: 'Bearer x' }),
    ).toThrow(/Forbidden telemetry attribute/);
  });
});
