import { ServiceDisruptor } from 'k6/x/disruptor';
import { check, sleep } from 'k6';
import http from 'k6/http';


export const options = {
    scenarios: {
        base: {
            executor: 'constant-arrival-rate',
            rate: 20,
            preAllocatedVUs: 5,
            maxVUs: 100,
            exec: 'requestName',
            startTime: '0s',
            duration: '30s',
        },
        inject: {
            executor: 'shared-iterations',
            iterations: 1,
            vus: 1,
            exec: 'injectFaults',
            startTime: '30s',
        },
        fault: {
            executor: 'constant-arrival-rate',
            rate: 20,
            preAllocatedVUs: 5,
            maxVUs: 100,
            exec: 'requestName',
            startTime: '30s',
            duration: '30s',
        },
    },
    thresholds: {
        'http_req_duration{scenario:base}': [],
        'checks{scenario:base}': [],
        'http_req_duration{scenario:fault}': [],
        'checks{scenario:fault}': [],
    },
}

export function requestName() {
    const result = http.get('http://namegenerator.default.svc.cluster.local:8080/name/random');
    check(result, {
      'http response status code is 200': result.status === 200,
    });
    sleep(1);
}

export function injectFaults() {
    const errorBody = '{"error":"Unexpected error","status_code":500,"status_text":"Internal Server Error"}';
  
    const fault = {
      averageDelay: '100ms',
      errorRate: 0.2,
      errorCode: 500,
      errorBody: errorBody,
      exclude: '/health',
    };

    const svcDisruptor = new ServiceDisruptor('namegenerator', 'default');
    svcDisruptor.injectHTTPFaults(fault, '30s');
  }