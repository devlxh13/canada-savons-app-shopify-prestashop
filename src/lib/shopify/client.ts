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
              id title bodyHtml vendor productType handle status
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

  async createProduct(input: {
    title: string;
    bodyHtml: string;
    vendor: string;
    productType: string;
    status: string;
    variants?: { price: string; sku: string; barcode: string }[];
  }): Promise<ShopifyProduct> {
    const { data } = await this.graphql.request(
      `mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product { id title bodyHtml vendor productType handle status }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );

    const result = data.productCreate as {
      product: ShopifyProduct | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }
    return result.product!;
  }

  async updateProduct(id: string, input: Record<string, unknown>): Promise<ShopifyProduct> {
    const { data } = await this.graphql.request(
      `mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title handle status }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id, ...input } } }
    );

    const result = data.productUpdate as {
      product: ShopifyProduct | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }
    return result.product!;
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
}
