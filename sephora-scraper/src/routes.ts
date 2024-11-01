import { createPlaywrightRouter, Dataset } from 'crawlee';
import { ProductInfo, ProductImage } from './types/index.js';

// Brands to skip UPPERCASE
const BRANDS_TO_SKIP: string[] = ['AAVRANI'];

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
    
    await page.waitForSelector('a[data-comp="BrandName "]', { timeout: 30000 });
    
    const brandLinks = await page.$$('a[data-comp="BrandName "]');
    log.info(`Found ${brandLinks.length} brands`);
    
    if (brandLinks.length > 0) {
        // Get first non-skipped brand
        const remainingBrands = [];
        for (const brand of brandLinks) {
            const name = await brand.textContent();
            const href = await brand.getAttribute('href');
            
            if (!BRANDS_TO_SKIP.includes(name?.trim().toUpperCase() || '')) {
                remainingBrands.push({ href, name });
            } else {
                log.info(`Skipping brand: ${name}`);
            }
        }
        
        if (remainingBrands.length > 0) {
            const firstBrand = remainingBrands.shift()!;
            await enqueueLinks({
                urls: [firstBrand.href!],
                label: 'BRAND',
                userData: { 
                    brandName: firstBrand.name,
                    remainingBrands,
                    brandIndex: 0
                }
            });
        }
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

// Function to extract product ID from URL
function getProductId(url: string): string | null {
    const match = url.match(/product\/([^?]+)/);
    return match ? match[1] : null;
}

// Handler for product pages
router.addHandler('PRODUCT', async ({ request, page, log }) => {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            log.info(`Scraping product at ${request.url}`);

            // Extract product ID from URL
            const productId = getProductId(request.url);
            if (!productId) {
                log.error('Product ID not found in URL');
                break;
            }

            // Take screenshot first
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
            const productData = await page.evaluate(( productId ): ProductInfo | null => {
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

                const brandName = document.querySelector("body > div:nth-child(3) > main > section > div.css-1v7u6og.eanm77i0 > div:nth-child(1) > h1 > a")?.textContent?.trim() || '';

                const reviewsCountSection = document.querySelector("body > div:nth-child(3) > main > section > div.css-1v7u6og.eanm77i0 > div:nth-child(1) > div.css-42r6cu.eanm77i0 > div > a.css-whkkt7.eanm77i0 > span.css-1j53ife");

                if (!reviewsCountSection) {
                    console.log('Reviews section not found');
                    return null;
                }

                const reviewsCount = reviewsCountSection?.textContent?.trim() || '';

                const reviewsAvgSection = document.querySelector("body > div:nth-child(3) > main > section > div.css-1v7u6og.eanm77i0 > div:nth-child(1) > div.css-42r6cu.eanm77i0 > div > a.css-whkkt7.eanm77i0 > span.css-1tbjoxk > span.css-j7llew");
                const reviewsAvg = reviewsAvgSection?.getAttribute('style')?.match(/width:\s*([\d.]+)%/)?.[1];

                const likesSection = document.querySelector("body > div:nth-child(3) > main > section > div.css-1v7u6og.eanm77i0 > div:nth-child(1) > div.css-42r6cu.eanm77i0 > div > div");

                if (!likesSection) {
                    console.log('Likes section not found');
                    return null;
                }

                const likes = likesSection?.textContent?.trim() || '';

                const price = document.querySelector("body > div:nth-child(3) > main > section > div.css-1v7u6og.eanm77i0 > div:nth-child(1) > div.css-1tzthcm.eanm77i0 > p > span > span.css-18jtttk > b")?.textContent?.trim() || '';

                // Extract product highlights safely
                const highlightsSection = document.querySelector("#details > div.css-h2sczi.eanm77i0");
                        
                if (!highlightsSection) {
                    console.log('Highlights section not found');
                    return null;
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
                    return null;
                }

                // Get all text content from the section
                const description = descriptionSection.textContent?.trim() || '';

                // Get ingredients
                const ingredientsSelection = document.querySelector("#ingredients");

                if (!ingredientsSelection) {
                    console.log('Ingredients section not found');
                    return null;
                }

                const ingredients = ingredientsSelection?.textContent?.trim() || '';

                // Get How to use section
                const howToUseSection = document.querySelector("#howtouse > div > div");

                if (!howToUseSection) {
                    console.log('How to use section not found');
                    return null;
                }

                const howToUse = howToUseSection?.textContent?.trim() || '';

                const sizeSection = document.querySelector("body > div:nth-child(3) > main > section > div.css-1v7u6og.eanm77i0 > div:nth-child(3) > div.css-1jp3h9y.eanm77i0 > div.css-k1zwuw.eanm77i0 > div.css-1ag3xrp.eanm77i0 > div");

                if (!sizeSection) {
                    console.log('Size section not found');
                    return null;
                }

                const size = sizeSection?.textContent?.trim() || '';

                console.log("productId", productId);

                return {
                    id: productId ?? '',
                    skuId: product.attributes?.skuId || '',
                    name: product.productInfo?.productName || '',
                    brand: brandName || '',
                    url: window.location.href,
                    images,
                    price: {
                        current: price || 0, // Convert to number
                        currency: 'USD'
                    },
                    reviews: {
                        average: reviewsAvg || 0,
                        count: reviewsCount || 0
                    },
                    likes: likes || 0,
                    category: product.attributes?.nthLevelCategory || '',
                    isOutOfStock: product.attributes?.isOutOfStock || false,
                    description: description || '',
                    highlights: highlights || [],
                    ingredients: ingredients || '',
                    howToUse: howToUse || '',
                    size: size || ''
                } satisfies ProductInfo;
            }, productId);

            if (productData) {
                const brandName = productData.brand.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const datasetName = `${brandName}`;
                // process.env.INDEX = productData.id;
                
                const dataset = await Dataset.open(datasetName);
                
                await dataset.pushData({
                    ...productData,
                    savedAt: new Date().toISOString()
                });
                break;
            }

        } catch (error) {
            if (retryCount >= maxRetries - 1) throw error;
            retryCount++;
            log.warning(`Retry ${retryCount}/${maxRetries}`);
            await page.waitForTimeout(5000 * retryCount);
        }
    }
});
