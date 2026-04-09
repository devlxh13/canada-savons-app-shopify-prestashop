import type { PSFilters, PSResourceType } from "./types";

export class PSApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
  }

  async list<T>(resource: PSResourceType, filters?: PSFilters): Promise<T[]> {
    const url = this.buildUrl(resource, undefined, filters);
    const data = await this.request(url);
    return (data[resource] as T[]) ?? [];
  }

  async get<T>(resource: PSResourceType, id: number): Promise<T> {
    const singularMap: Record<string, string> = {
      products: "product",
      categories: "category",
      customers: "customer",
      addresses: "address",
      orders: "order",
      stock_availables: "stock_available",
      combinations: "combination",
      images: "image",
    };
    const url = this.buildUrl(resource, id);
    const data = await this.request(url);
    const singular = singularMap[resource] ?? resource;
    return (data[singular] ?? data[resource]) as T;
  }

  async search<T>(resource: PSResourceType, query: string): Promise<T[]> {
    const url = this.buildUrl(resource, undefined, {
      filter: { name: `%${query}%` },
      display: "full",
    });
    const data = await this.request(url);
    return (data[resource] as T[]) ?? [];
  }

  private buildUrl(resource: PSResourceType, id?: number, filters?: PSFilters): string {
    let url = `${this.baseUrl}${resource}`;
    if (id) url += `/${id}`;

    const params = new URLSearchParams();
    params.set("output_format", "JSON");
    // Don't add display for single-resource fetches — PS API returns
    // full object by default and display=full breaks the response format
    if (!id && filters?.display) params.set("display", filters.display);
    if (!id && !filters?.display) params.set("display", "full");

    if (filters?.limit) {
      // PS API uses limit=offset,count format for pagination
      if (filters.offset) {
        params.set("limit", `${filters.offset},${filters.limit}`);
      } else {
        params.set("limit", String(filters.limit));
      }
    }
    if (filters?.sort) params.set("sort", filters.sort);
    if (filters?.filter) {
      for (const [key, value] of Object.entries(filters.filter)) {
        params.set(`filter[${key}]`, value);
      }
    }

    return `${url}?${params.toString()}`;
  }

  private async request(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      headers: { Authorization: this.authHeader },
    });

    if (!response.ok) {
      throw new Error(`PrestaShop API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }
}
