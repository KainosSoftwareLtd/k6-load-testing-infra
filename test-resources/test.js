import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { target: 10, duration: '10s' },
    { target: 100, duration: '20s' },
    { target: 200, duration: '40s' },
    { target: 50, duration: '50s' },
    { target: 10, duration: '70s' },
  ],
};

export default function () {
  const result = http.get('http://namegenerator.default.svc.cluster.local:8080/name/random');
  check(result, {
    'http response status code is 200': result.status === 200,
  });
  sleep(1);
}
