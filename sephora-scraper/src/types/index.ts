export interface ProductImage {
  url: string;
  isMain: boolean;
  isThumbnail: boolean;
}

export interface ProductInfo {
  // Basic info
  id: string;
  skuId: string;
  name: string;
  brand: string;
  url: string;
  
  // Media
  images: ProductImage[];
  
  // Pricing
  price: {
    current: number;
    original?: number;
    currency: string;
  };
  
  // Ratings
  rating: {
    average: number;
    count: number;
  };
  
  // Social
  likes: number;
  
  // Optional HTML body
  bodyHtml?: string | null;
}

declare global {
    interface Window {
        digitalData: {
            product: Array<{
                productInfo?: {
                    productId?: string;
                    productName?: string;
                    brandName?: string;
                    productDescription?: string;
                };
                attributes?: {
                    skuId?: string;
                    price?: string;
                    rating?: number;
                    reviewCount?: number;
                    nthLevelCategory?: string;
                    isOutOfStock?: boolean;
                };
            }>;
        };
    }
}
