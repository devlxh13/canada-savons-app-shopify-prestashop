import type { PSFilters, PSResourceType } from "./types";
import type { PSApiClient } from "./api-client";
import type { PSDbClient } from "./db-client";

type DbListMethod = "listProducts" | "listCustomers" | "listOrders";
type DbGetMethod = "getProduct" | "getCustomer";

const DB_LIST_MAP: Partial<Record<PSResourceType, DbListMethod>> = {
  products: "listProducts",
  customers: "listCustomers",
  orders: "listOrders",
};

const DB_GET_MAP: Partial<Record<PSResourceType, DbGetMethod>> = {
  products: "getProduct",
  customers: "getCustomer",
};

export class PSConnector {
  constructor(
    private apiClient: PSApiClient,
    private dbClient: PSDbClient
  ) {}

  async list<T>(resource: PSResourceType, filters?: PSFilters): Promise<T[]> {
    try {
      return await this.apiClient.list<T>(resource, filters);
    } catch {
      const dbMethod = DB_LIST_MAP[resource];
      if (dbMethod && typeof this.dbClient[dbMethod] === "function") {
        return (await this.dbClient[dbMethod]({
          limit: filters?.limit,
          offset: filters?.offset,
        })) as T[];
      }
      throw new Error(`No DB fallback available for resource: ${resource}`);
    }
  }

  async get<T>(resource: PSResourceType, id: number): Promise<T> {
    try {
      return await this.apiClient.get<T>(resource, id);
    } catch {
      const dbMethod = DB_GET_MAP[resource];
      if (dbMethod && typeof this.dbClient[dbMethod] === "function") {
        const result = await this.dbClient[dbMethod](id);
        if (!result) throw new Error(`${resource} #${id} not found`);
        return result as T;
      }
      throw new Error(`No DB fallback available for resource: ${resource}`);
    }
  }

  async search<T>(resource: PSResourceType, query: string): Promise<T[]> {
    return this.apiClient.search<T>(resource, query);
  }
}
