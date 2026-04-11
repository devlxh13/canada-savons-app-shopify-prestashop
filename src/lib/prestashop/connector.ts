import type { PSFilters, PSResourceType } from "./types";
import type { PSApiClient } from "./api-client";
import type { PSDbClient } from "./db-client";

type DbListMethod = "listProducts" | "listCustomers" | "listOrders";
type DbGetMethod = "getProduct" | "getCustomer" | "getOrder";

const DB_LIST_MAP: Partial<Record<PSResourceType, DbListMethod>> = {
  products: "listProducts",
  customers: "listCustomers",
  orders: "listOrders",
};

const DB_GET_MAP: Partial<Record<PSResourceType, DbGetMethod>> = {
  products: "getProduct",
  customers: "getCustomer",
  orders: "getOrder",
};

export class PSConnector {
  private fulfilledStateIdsPromise: Promise<Set<string>> | null = null;

  constructor(
    private apiClient: PSApiClient,
    private dbClient: PSDbClient
  ) {}

  /**
   * Returns the set of PS order-state IDs (as strings) that represent a
   * shipped or delivered order. Reads ps_order_state.shipped/delivered
   * directly from the DB — this data is static config so no API fallback
   * is needed. Cached per-instance so repeated calls within a sync session
   * hit the DB only once.
   */
  async getFulfilledStateIds(): Promise<Set<string>> {
    if (this.fulfilledStateIdsPromise) return this.fulfilledStateIdsPromise;
    this.fulfilledStateIdsPromise = this.dbClient.listOrderStates().then((rows) => {
      const ids = new Set<string>();
      for (const row of rows) {
        const shipped = Number(row.shipped) === 1;
        const delivered = Number(row.delivered) === 1;
        if (shipped || delivered) {
          ids.add(String(row.id_order_state));
        }
      }
      return ids;
    });
    return this.fulfilledStateIdsPromise;
  }

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
