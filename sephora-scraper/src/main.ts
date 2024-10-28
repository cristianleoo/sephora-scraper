// For more information, see https://crawlee.dev/
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { BrowserName, DeviceCategory, OperatingSystemsName, CommonLibrary, PlaywrightPlugin } from '@crawlee/browser-pool';
import { firefox } from 'playwright';

import { router } from './routes.js';

const startUrls = ['https://www.sephora.com/brands-list'];

const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
        'http://148.72.140.24:30127',
        'http://199.195.253.14:1080',
        'http://108.181.167.208:4081',
        'http://154.9.227.204:8080',
        // Add more proxies as needed
    ]
});

const crawler = new PlaywrightCrawler({
    requestHandler: router,
    maxRequestsPerCrawl: 10000,
    headless: true,
    navigationTimeoutSecs: 30,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 5,
    launchContext: {
        launcher: firefox,
    },
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            fingerprintGeneratorOptions: {
                browsers: [
                    {
                        name: BrowserName.edge,
                        minVersion: 96,
                    },
                ],
                devices: [DeviceCategory.desktop],
                operatingSystems: [OperatingSystemsName.windows],
                screen: {
                    minWidth: 1366,
                    minHeight: 768,
                },
            },
        },
    },
    preNavigationHooks: [
        async ({ page }) => {
            // Disable webdriver
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                
                // Add additional evasions
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                
                // Mock permissions API
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters: any): Promise<PermissionStatus> => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({
                            state: Notification.permission,
                            name: 'notifications',
                            onchange: null,
                            addEventListener: () => {},
                            removeEventListener: () => {},
                            dispatchEvent: () => false,
                        } as PermissionStatus) :
                        originalQuery(parameters)
                );
            });
            
            // Random delay between requests (1-5 seconds)
            await page.waitForTimeout(Math.random() * 4000 + 1000);
        },
    ],
    // proxyConfiguration,
});

await crawler.run(startUrls);
