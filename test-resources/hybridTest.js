import { browser } from 'k6/experimental/browser';
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    scenarios: {
        ui1: {
            executor: 'constant-vus',
            exec: 'browserTest',
            options: {
                browser: {
                    type: 'chromium',
                },
            },
            vus: 2,
            startTime: '0s',
            duration: '30s'
        },
        ui2: {
            executor: 'constant-vus',
            exec: 'browserTest',
            options: {
                browser: {
                    type: 'chromium',
                },
            },
            vus: 2,
            startTime: '30s',
            duration: '30s'
        },
        backend: {
            executor: 'constant-vus',
            exec: 'protocolTest',
            vus: 30,
            startTime: '30s',
            duration: '60s'
        }
    },
    thresholds: {
        'browser_http_req_duration{scenario:ui1}': [],
        'browser_http_req_duration{scenario:ui2}': [],
    },
}

export async function browserTest() {
    const context = browser.newContext();
    const page = context.newPage();

    try {

        await page.goto('https://vxepqrdppv.eu-west-1.awsapprunner.com/start');
        const element = page.locator('a[class="govuk-button govuk-button--start"]');
        await element.click();


        //page.waitForSelector('h1[class="govuk-fieldset__heading"]');
        const nationalityInput = page.locator('#isUKApplication-true');
        await nationalityInput.click();

        const submitNationality = page.locator('button[class="govuk-button button"]');
        await submitNationality.click();
        //page.waitForSelector('h1[class="govuk-fieldset__heading"]');


    } finally {
        page.close();
    }
}

export function protocolTest() {
    const res = http.get('https://vxepqrdppv.eu-west-1.awsapprunner.com/start');
    check(res, {
        'status is 200': res => res.status === 200
    })
}

