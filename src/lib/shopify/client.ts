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
    lineItems: {
      variantId: string;
      quantity: number;
      priceSet?: { shopMoney: { amount: string; currencyCode: string } };
    }[];
    billingAddress?: Record<string, string>;
    shippingAddress?: Record<string, string>;
    financialStatus: string;
    note: string;
    tags: string[];
    processedAt?: string;
    fulfillmentStatus?: "FULFILLED" | "PARTIAL" | "RESTOCKED";
    currency?: string;
    taxesIncluded?: boolean;
    shippingLines?: {
      title: string;
      priceSet: { shopMoney: { amount: string; currencyCode: string } };
    }[];
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
            ...(input.processedAt && { processedAt: input.processedAt }),
            ...(input.fulfillmentStatus && { fulfillmentStatus: input.fulfillmentStatus }),
            ...(input.currency && { currency: input.currency }),
            ...(input.taxesIncluded !== undefined && { taxesIncluded: input.taxesIncluded }),
            ...(input.shippingLines && { shippingLines: input.shippingLines }),
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

  /**
   * Archive an existing Shopify order that is being superseded by a
   * fresh re-sync: tags it and appends a suffix to its note. Used by
   * the backfill script so merchants can filter superseded duplicates
   * without losing traceability. Hard-delete is intentionally avoided
   * (scopes + history preservation).
   */
  async tagAndNoteOrder(
    gid: string,
    { addTag, noteSuffix }: { addTag: string; noteSuffix: string }
  ): Promise<void> {
    // 1) Read current note so we can append rather than replace
    const { data: readData } = await this.graphql.request(
      `query getOrderNote($id: ID!) {
        order(id: $id) { id note }
      }`,
      { variables: { id: gid } }
    );
    const currentOrder = readData.order as { id: string; note: string | null } | null;
    const currentNote = currentOrder?.note ?? "";

    // 2) Add the archival tag
    const { data: tagData } = await this.graphql.request(
      `mutation tagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          node { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: gid, tags: [addTag] } }
    );
    const tagResult = tagData.tagsAdd as {
      node: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
    if (tagResult.userErrors.length > 0) {
      throw new Error(tagResult.userErrors.map((e) => e.message).join(", "));
    }

    // 3) Append suffix to note via orderUpdate
    const { data: updateData } = await this.graphql.request(
      `mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id note }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: gid,
            note: `${currentNote}${noteSuffix}`,
          },
        },
      }
    );
    const updateResult = updateData.orderUpdate as {
      order: { id: string; note: string | null } | null;
      userErrors: { field: string[]; message: string }[];
    };
    if (updateResult.userErrors.length > 0) {
      throw new Error(updateResult.userErrors.map((e) => e.message).join(", "));
    }
  }

  async setInventory(productGid: string, quantity: number): Promise<void> {
    // Get variant's inventoryItem ID + current quantity
    const { data: prodData } = await this.graphql.request(
      `query getInventoryItem($id: ID!) {
        product(id: $id) {
          variants(first: 1) {
            edges {
              node {
                inventoryItem {
                  id
                  inventoryLevels(first: 1) {
                    edges {
                      node {
                        location { id }
                        quantities(names: ["available"]) { quantity }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      { variables: { id: productGid } }
    );

    const variant = (prodData.product as any)?.variants?.edges?.[0]?.node;
    const inventoryItemId = variant?.inventoryItem?.id;
    if (!inventoryItemId) return;

    const level = variant.inventoryItem.inventoryLevels?.edges?.[0]?.node;
    const locationId = level?.location?.id;
    const currentQty = level?.quantities?.[0]?.quantity ?? 0;
    if (!locationId) return;

    // Skip if already correct
    if (currentQty === quantity) return;

    const idempotentKey = `inv-${inventoryItemId}-${Date.now()}`;

    // Set inventory with @idempotent directive + changeFromQuantity
    await this.graphql.request(
      `mutation($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) @idempotent(key: "${idempotentKey}") {
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            reason: "correction",
            name: "available",
            quantities: [{ inventoryItemId, locationId, quantity, changeFromQuantity: currentQty }],
          },
        },
      }
    );
  }
}
