import { createPool, type Pool, type PoolOptions } from "mysql2/promise";

interface PSDbFilters {
  limit?: number;
  offset?: number;
  langId?: number;
  search?: string;
}

export class PSDbClient {
  private pool: Pool;

  constructor(config: PoolOptions) {
    this.pool = createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }

  async listProducts(filters: PSDbFilters = {}): Promise<Record<string, unknown>[]> {
    const langId = filters.langId ?? 1;
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = `
      SELECT p.id_product as id, pl.name, pl.description, pl.description_short,
             pl.link_rewrite, pl.meta_title, pl.meta_description,
             p.price, p.reference, p.active, p.weight, p.ean13,
             p.id_category_default, p.id_manufacturer, p.date_add, p.date_upd
      FROM ps_product p
      JOIN ps_product_lang pl ON p.id_product = pl.id_product AND pl.id_lang = ?
      WHERE 1=1
    `;
    const params: unknown[] = [langId];

    if (filters.search) {
      query += " AND pl.name LIKE ?";
      params.push(`%${filters.search}%`);
    }

    query += " ORDER BY p.id_product DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await this.pool.query(query, params);
    return rows as Record<string, unknown>[];
  }

  async getProduct(id: number, langId: number = 1): Promise<Record<string, unknown> | null> {
    const [rows] = await this.pool.query(
      `SELECT p.id_product as id, pl.name, pl.description, pl.description_short,
              pl.link_rewrite, pl.meta_title, pl.meta_description,
              p.price, p.reference, p.active, p.weight, p.ean13,
              p.id_category_default, p.id_manufacturer, p.date_add, p.date_upd
       FROM ps_product p
       JOIN ps_product_lang pl ON p.id_product = pl.id_product AND pl.id_lang = ?
       WHERE p.id_product = ?`,
      [langId, id]
    );
    const results = rows as Record<string, unknown>[];
    return results[0] ?? null;
  }

  async listCustomers(filters: PSDbFilters = {}): Promise<Record<string, unknown>[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = `
      SELECT id_customer as id, firstname, lastname, email, active, date_add, date_upd
      FROM ps_customer
      WHERE deleted = 0
    `;
    const params: unknown[] = [];

    if (filters.search) {
      query += " AND (firstname LIKE ? OR lastname LIKE ? OR email LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += " ORDER BY id_customer DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await this.pool.query(query, params);
    return rows as Record<string, unknown>[];
  }

  async getCustomer(id: number): Promise<Record<string, unknown> | null> {
    const [rows] = await this.pool.query(
      `SELECT id_customer as id, firstname, lastname, email, active, date_add, date_upd
       FROM ps_customer
       WHERE deleted = 0 AND id_customer = ?`,
      [id]
    );
    const results = rows as Record<string, unknown>[];
    return results[0] ?? null;
  }

  async getOrder(id: number): Promise<Record<string, unknown> | null> {
    const [headerRows] = await this.pool.query(
      `SELECT id_order as id, id_customer, id_cart, id_currency, current_state,
              payment, total_paid, total_paid_tax_incl, total_paid_tax_excl,
              total_shipping, total_products, date_add, date_upd, reference
       FROM ps_orders
       WHERE id_order = ?`,
      [id]
    );
    const header = (headerRows as Record<string, unknown>[])[0];
    if (!header) return null;

    const [detailRows] = await this.pool.query(
      `SELECT id_order_detail as id, product_id, product_quantity,
              product_price, product_name,
              unit_price_tax_incl, unit_price_tax_excl
       FROM ps_order_detail
       WHERE id_order = ?`,
      [id]
    );

    return {
      ...header,
      associations: { order_rows: detailRows as Record<string, unknown>[] },
    };
  }

  async listOrders(filters: PSDbFilters = {}): Promise<Record<string, unknown>[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const query = `
      SELECT id_order as id, id_customer, reference, payment,
             total_paid, total_paid_tax_incl, total_paid_tax_excl,
             total_shipping, total_products, current_state, date_add, date_upd
      FROM ps_orders
      ORDER BY id_order DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await this.pool.query(query, [limit, offset]);
    return rows as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
