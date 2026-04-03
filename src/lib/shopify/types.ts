export interface ShopifyProduct {
  id: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

export interface ShopifyVariant {
  id?: string;
  title: string;
  price: string;
  sku: string;
  weight: number;
  weightUnit: "KILOGRAMS" | "GRAMS";
  barcode: string;
  inventoryQuantity?: number;
}

export interface ShopifyImage {
  id?: string;
  src: string;
  altText: string;
}

export interface ShopifyCustomer {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  addresses: ShopifyAddress[];
}

export interface ShopifyAddress {
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  country: string;
  phone?: string;
  company?: string;
}

export interface ShopifyCollection {
  id?: string;
  title: string;
  bodyHtml: string;
  handle: string;
}

export interface ShopifyFilters {
  first?: number;
  after?: string;
  query?: string;
}
