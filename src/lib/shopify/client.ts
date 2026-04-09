import type { ShopifyProduct, ShopifyCustomer, ShopifyFilters } from "./types";

interface GraphQLClient {
  request(query: string, options?: { variables?: Record<string, unknown> }): Promise<{ data: Record<string, unknown> }>;
}

interface ProductsResult {
  products: ShopifyProduct[];
  pageInfo: { hasNextPage: boolean; endCursor?: string };
}

export class ShopifyClient {
  constructor(private graphql: GraphQLClient) {}

  async listProducts(filters: ShopifyFilters = {}): Promise<ProductsResult> {
    const { data } = await this.graphql.request(
      `query listProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
          edges {
            node {
              id title descriptionHtml vendor productType handle status
              variants(first: 100) { edges { node { id title price sku barcode } } }
              images(first: 20) { edges { node { id src: url altText } } }
            }
            cursor
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { variables: { first: filters.first ?? 20, after: filters.after ?? null, query: filters.query ?? null } }
    );

    const productsData = data.products as {
      edges: { node: ShopifyProduct & { variants: { edges: { node: unknown }[] }; images: { edges: { node: unknown }[] } }; cursor: string }[];
      pageInfo: { hasNextPage: boolean; endCursor?: string };
    };

    return {
      products: productsData.edges.map((e) => ({
        ...e.node,
        variants: e.node.variants.edges.map((v) => v.node) as ShopifyProduct["variants"],
        images: e.node.images.edges.map((i) => i.node) as ShopifyProduct["images"],
      })),
      pageInfo: productsData.pageInfo,
    };
  }

  async createProduct(productInput: Record<string, unknown>, variantData?: { price: string; barcode: string }): Promise<ShopifyProduct> {
    // Step 1: Create product
    const { data } = await this.graphql.request(
      `mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id title descriptionHtml vendor productType handle status
            variants(first: 1) { edges { node { id } } }
          }
          userErrors { field message }
        }
      }`,
      { variables: { input: productInput } }
    );

    const result = data.productCreate as {
      product: (ShopifyProduct & { variants: { edges: { node: { id: string } }[] } }) | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }

    const product = result.product!;

    // Step 2: Update the default variant with price/barcode if provided
    if (variantData && product.variants?.edges?.[0]?.node?.id) {
      const variantId = product.variants.edges[0].node.id;
      await this.graphql.request(
        `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }`,
        {
          variables: {
            productId: product.id,
            variants: [{ id: variantId, price: variantData.price, barcode: variantData.barcode }],
          },
        }
      );
    }

    return product;
  }

  async updateProduct(id: string, productInput: Record<string, unknown>, variantData?: { price: string; barcode: string }): Promise<ShopifyProduct> {
    const { data } = await this.graphql.request(
      `mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id title handle status
            variants(first: 1) { edges { node { id } } }
          }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id, ...productInput } } }
    );

    const result = data.productUpdate as {
      product: (ShopifyProduct & { variants: { edges: { node: { id: string } }[] } }) | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }

    const product = result.product!;

    // Update variant price/barcode
    if (variantData && product.variants?.edges?.[0]?.node?.id) {
      const variantId = product.variants.edges[0].node.id;
      await this.graphql.request(
        `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }`,
        {
          variables: {
            productId: product.id,
            variants: [{ id: variantId, price: variantData.price, barcode: variantData.barcode }],
          },
        }
      );
    }

    return product;
  }

  async createCustomer(input: {
    firstName: string;
    lastName: string;
    email: string;
    addresses?: { address1: string; city: string; zip: string; country: string }[];
  }): Promise<ShopifyCustomer> {
    const { data } = await this.graphql.request(
      `mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id firstName lastName email }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );

    const result = data.customerCreate as {
      customer: ShopifyCustomer | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }
    return result.customer!;
  }

  async findExistingProduct(sku: string, title: string): Promise<string | null> {
    if (sku) {
      const { products } = await this.listProducts({ first: 1, query: `sku:${sku}` });
      if (products.length > 0) return products[0].id;
    }
    if (title) {
      const { products } = await this.listProducts({ first: 1, query: `title:${title}` });
      if (products.length > 0) return products[0].id;
    }
    return null;
  }

  async findCustomerByEmail(email: string): Promise<string | null> {
    const { data } = await this.graphql.request(
      `query findCustomer($query: String!) {
        customers(first: 1, query: $query) {
          edges { node { id } }
        }
      }`,
      { variables: { query: `email:${email}` } }
    );
    const customers = data.customers as { edges: { node: { id: string } }[] };
    return customers.edges.length > 0 ? customers.edges[0].node.id : null;
  }

  async updateCustomer(id: string, input: Record<string, unknown>): Promise<ShopifyCustomer> {
    const { data } = await this.graphql.request(
      `mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id firstName lastName email }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id, ...input } } }
    );

    const result = data.customerUpdate as {
      customer: ShopifyCustomer | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }
    return result.customer!;
  }

  async createOrder(input: {
    customerId: string;
    lineItems: { variantId: string; quantity: number }[];
    billingAddress?: Record<string, string>;
    shippingAddress?: Record<string, string>;
    financialStatus: string;
    note: string;
    tags: string[];
  }): Promise<{ id: string }> {
    const { data } = await this.graphql.request(
      `mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          order { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          order: {
            customerId: input.customerId,
            lineItems: input.lineItems,
            billingAddress: input.billingAddress,
            shippingAddress: input.shippingAddress,
            financialStatus: input.financialStatus,
            note: input.note,
            tags: input.tags,
          },
          options: { inventoryBehaviour: "BYPASS" },
        },
      }
    );

    const result = data.orderCreate as {
      order: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }
    return result.order!;
  }

  async setInventory(productGid: string, quantity: number): Promise<void> {
    // Get variant's inventoryItem ID
    const { data: prodData } = await this.graphql.request(
      `query getInventoryItem($id: ID!) {
        product(id: $id) {
          variants(first: 1) {
            edges { node { inventoryItem { id } } }
          }
        }
      }`,
      { variables: { id: productGid } }
    );
    const product = prodData.product as { variants: { edges: { node: { inventoryItem: { id: string } } }[] } };
    const inventoryItemId = product.variants.edges[0]?.node?.inventoryItem?.id;
    if (!inventoryItemId) return;

    // Get first location
    const { data: locData } = await this.graphql.request(
      `query { locations(first: 1) { edges { node { id } } } }`
    );
    const locations = locData.locations as { edges: { node: { id: string } }[] };
    const locationId = locations.edges[0]?.node?.id;
    if (!locationId) return;

    // Set inventory quantity
    await this.graphql.request(
      `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            reason: "correction",
            name: "available",
            quantities: [{ inventoryItemId, locationId, quantity }],
          },
        },
      }
    );
  }
}
