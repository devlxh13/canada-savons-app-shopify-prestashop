import { PSApiClient } from "./api-client";
import { PSDbClient } from "./db-client";
import { PSConnector } from "./connector";

let connector: PSConnector | null = null;

export function getPSConnector(): PSConnector {
  if (connector) return connector;

  const apiClient = new PSApiClient(
    process.env.PRESTASHOP_API_URL!,
    process.env.PRESTASHOP_API_KEY!
  );

  const dbClient = new PSDbClient({
    host: process.env.PRESTASHOP_DB_HOST!,
    user: process.env.PRESTASHOP_DB_USER!,
    password: process.env.PRESTASHOP_DB_PASSWORD!,
    database: process.env.PRESTASHOP_DB_NAME!,
  });

  connector = new PSConnector(apiClient, dbClient);
  return connector;
}
