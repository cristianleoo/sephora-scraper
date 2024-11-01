export interface ProductImage {
  url: string;
  isMain: boolean;
  isThumbnail: boolean;
}

export interface ProductInfo {
  // Basic info
  id: string;
//   productId: string;
  skuId: string;
  name: string;
  brand: string;
  url: string;
  
  // Media
  images: ProductImage[];
  
  // Pricing
  price: {
    current: string | number;
    currency: string;
  };
  
  // Reviews
  reviews: {
    average: string | number;
    count: string | number;
  };
  
  // Social
  likes: string | number;

  // Category
  category: string;

  // Out of stock
  isOutOfStock: boolean;

  // Highlights
  highlights: string[];

  // Ingredients
  ingredients: string;

  // Description
  description: string;

  // How to use
  howToUse: string;

  // Size
  size: string;
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
                    rating?: string | number;
                    reviewCount?: string | number;
                    nthLevelCategory?: string;
                    isOutOfStock?: boolean;
                };
            }>;
        };
    }
}
