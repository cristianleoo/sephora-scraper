import { createPlaywrightRouter, Dataset } from 'crawlee';
import { ProductInfo, ProductImage } from './types/index.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

export const router = createPlaywrightRouter();

router.addDefaultHandler(async ({ request, page, enqueueLinks, log }) => {
    log.info(`Processing ${request.url}...`);

    if (request.url.includes('/brands-list')) {
        // Wait for brands to load
        await page.waitForSelector('a[data-at="brand_link"]', { timeout: 30000 });
        
        const brandLinks = await page.$$('a[data-at="brand_link"]');
        
        // Only enqueue the first brand initially
        if (brandLinks.length > 0) {
            const firstBrand = brandLinks[0];
            const href = await firstBrand.getAttribute('href') || '';
            const name = await firstBrand.textContent() || '';
            
            await enqueueLinks({
                urls: [href],
                label: 'BRAND',
                userData: { 
                    brandName: name,
                    brandLinks: brandLinks.slice(1),
                    brandIndex: 0
                }
            });
        }
    }
});

router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });

    await pushData({
        url: request.loadedUrl,
        title,
    });
});

// Initial handler to get all brands
router.addHandler('initial', async ({ page, enqueueLinks, log }) => {
    log.info('Getting brand links...');
    
    // Wait for brand links to load
    await page.waitForSelector('a[data-comp="BrandName "]', { timeout: 30000 });
    
    // Get all brand links
    const brandLinks = await page.$$('a[data-comp="BrandName "]');
    log.info(`Found ${brandLinks.length} brands`);
    
    if (brandLinks.length > 0) {
        // Get first brand's info
        const firstBrand = brandLinks[0];
        const href = await firstBrand.getAttribute('href');
        const name = await firstBrand.textContent();
        
        // Store remaining brand elements for later
        const remainingBrands = [];
        for (let i = 1; i < brandLinks.length; i++) {
            const brand = brandLinks[i];
            const brandHref = await brand.getAttribute('href');
            const brandName = await brand.textContent();
            remainingBrands.push({ href: brandHref, name: brandName });
        }
        
        // Enqueue first brand
        await enqueueLinks({
            urls: [href!], // Add non-null assertion since href is string | null
            label: 'BRAND',
            userData: { 
                brandName: name,
                remainingBrands: remainingBrands,
                brandIndex: 0
            }
        });
    }
});

// Handler for brand pages
router.addHandler('BRAND', async ({ request, page, enqueueLinks, log }) => {
    const { brandName, remainingBrands, brandIndex } = request.userData;
    log.info(`Processing brand: ${brandName}`);

    // Wait for product links to load
    await page.waitForSelector('a.css-klx76', { timeout: 30000 });
    
    // Enqueue all products for current brand
    await enqueueLinks({
        selector: 'a.css-klx76',
        label: 'PRODUCT',
        userData: { brandName }
    });

    // Check for next page of current brand
    const hasNextPage = await page.isVisible('a[data-at="pagination_next"]');
    if (hasNextPage) {
        await enqueueLinks({
            selector: 'a[data-at="pagination_next"]',
            label: 'BRAND',
            userData: { 
                brandName, 
                remainingBrands, 
                brandIndex 
            }
        });
    } 
    // If no next page and there are more brands, enqueue the next brand
    else if (remainingBrands && brandIndex < remainingBrands.length) {
        const nextBrand = remainingBrands[brandIndex];
        await enqueueLinks({
            urls: [nextBrand.href],
            label: 'BRAND',
            userData: { 
                brandName: nextBrand.name,
                remainingBrands,
                brandIndex: brandIndex + 1
            }
        });
    }
});

// Handler for product pages
router.addHandler('PRODUCT', async ({ request, page, log }) => {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            log.info(`Scraping product at ${request.url}`);

            // Take screenshot first
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const productId = request.url.split('/').pop();
            // await page.screenshot({
            //     path: `screenshots/${productId}-${timestamp}.png`,
            //     fullPage: true
            // });

            // Add random delay between 2-5 seconds
            await page.waitForTimeout(2000 + Math.random() * 3000);

            // Add stealth mode configurations
            await page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1'
            });

            // Try to bypass initial detection
            await page.setViewportSize({
                width: 1920 + Math.floor(Math.random() * 100),
                height: 1080 + Math.floor(Math.random() * 100)
            });

            // Check for anti-bot protection
            // const blocked = await page.$('div[class*="captcha"]');
            // if (blocked) {
            //     throw new Error('Hit CAPTCHA/anti-bot protection');
            // }

            // Wait for digitalData to be available
            await page.waitForFunction(() => window.digitalData?.product?.[0], { timeout: 30000 });

            // Extract product data using digitalData
            const productData = await page.evaluate(() => {
                const product = window.digitalData.product[0];
                if (!product) return null;
                
                const images: ProductImage[] = [];

                // Process images from the DOM
                document.querySelectorAll('img[srcset]').forEach(img => {
                    const srcset = img.getAttribute('srcset');
                    const alt = img.getAttribute('alt');
                    if (srcset && !alt?.includes('Video')) {
                        const highResUrl = srcset.split(',')
                            .pop()?.trim()
                            .split(' ')[0];
                        if (highResUrl) {
                            images.push({
                                url: highResUrl,
                                isMain: alt?.includes('main-zoom') || false,
                                isThumbnail: false
                            });
                        }
                    }
                });

                // Extract product highlights safely
                const highlightsSection = document.querySelector("#details > div.css-h2sczi.eanm77i0");
                        
                if (!highlightsSection) {
                    console.log('Highlights section not found');
                    return [];
                }

                const highlights: ProductInfo['highlights'] = [];
                highlightsSection.querySelectorAll('span').forEach(span => {
                    const text = span.textContent?.trim();
                    if (text && text.length > 0) {
                        highlights.push(text);
                    }
                });

                const descriptionSection = document.querySelector("#details > div.css-32uy52.eanm77i0 > div:nth-child(2) > div");
                        
                if (!descriptionSection) {
                    console.log('Description section not found');
                    return '';
                }

                // Get all text content from the section
                const description = descriptionSection.textContent?.trim() || '';

                // If no images were found, include the HTML body
                const bodyHtml = images.length === 0 ? document.body.innerHTML : null;

                return {
                    id: product.productInfo?.productId || '',
                    skuId: product.attributes?.skuId || '',
                    name: product.productInfo?.productName || '',
                    brand: product.productInfo?.brandName || '',
                    url: window.location.href,
                    images,
                    price: {
                        current: product.attributes?.price || '',
                        currency: 'USD'
                    },
                    rating: {
                        average: product.attributes?.rating || 0,
                        count: product.attributes?.reviewCount || 0
                    },
                    likes: 0,
                    // Additional fields from digitalData
                    category: product.attributes?.nthLevelCategory || '',
                    isOutOfStock: product.attributes?.isOutOfStock || false,
                    description: description,
                    highlights: highlights || [],
                    bodyHtml // Will be null if images were found
                };
            });

            // Add type check before pushing
            if (productData && typeof productData === 'object') {
                await Dataset.pushData(productData);
                break; // Success, exit loop
            }

        } catch (error) {
            if (retryCount >= maxRetries - 1) throw error;
            retryCount++;
            log.warning(`Retry ${retryCount}/${maxRetries}`);
            await page.waitForTimeout(5000 * retryCount);
        }
    }
});
