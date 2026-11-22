import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '15s',
};

const base = __ENV.API_BASE || 'http://localhost:3101';

export default function () {
  const health = http.get(`${base}/health`);
  check(health, {
    'health is 200 or 503': (r) => r.status === 200 || r.status === 503,
  });

  const projects = http.get(`${base}/projects`);
  check(projects, {
    'unauthenticated projects is 401 or 429': (r) =>
      r.status === 401 || r.status === 429,
  });
  sleep(0.2);
}
