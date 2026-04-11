export interface PSMultiLangValue {
  id: string;
  value: string;
}

export interface PSProduct {
  id: number;
  id_manufacturer: string;
  id_category_default: string;
  id_default_image: string;
  reference: string;
  price: string;
  active: string;
  name: PSMultiLangValue[];
  description: PSMultiLangValue[];
  description_short: PSMultiLangValue[];
  link_rewrite: PSMultiLangValue[];
  meta_title: PSMultiLangValue[];
  meta_description: PSMultiLangValue[];
  weight: string;
  ean13: string;
  id_tax_rules_group: string;
  date_add: string;
  date_upd: string;
  associations: {
    categories?: { id: string }[];
    images?: { id: string }[];
    stock_availables?: { id: string; id_product_attribute: string }[];
  };
}

export interface PSCategory {
  id: number;
  id_parent: string;
  active: string;
  name: PSMultiLangValue[];
  description: PSMultiLangValue[];
  link_rewrite: PSMultiLangValue[];
}

export interface PSCustomer {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  active: string;
  date_add: string;
  date_upd: string;
}

export interface PSAddress {
  id: number;
  id_customer: string;
  firstname: string;
  lastname: string;
  company: string;
  address1: string;
  address2: string;
  postcode: string;
  city: string;
  id_country: string;
  phone: string;
  phone_mobile: string;
}

export interface PSOrder {
  id: number;
  id_customer: string;
  id_cart: string;
  id_currency: string;
  current_state: string;
  payment: string;
  total_paid: string;
  total_paid_tax_incl: string;
  total_paid_tax_excl: string;
  total_shipping: string;
  total_products: string;
  date_add: string;
  date_upd: string;
  reference: string;
  associations?: {
    order_rows?: {
      id: string;
      product_id: string;
      product_quantity: string;
      product_price: string;
      product_name: string;
      unit_price_tax_incl: string;
      unit_price_tax_excl: string;
    }[];
  };
}

export interface PSStockAvailable {
  id: number;
  id_product: string;
  id_product_attribute: string;
  quantity: string;
}

export interface PSImage {
  id: number;
  id_product: string;
}

export interface PSFilters {
  limit?: number;
  offset?: number;
  filter?: Record<string, string>;
  display?: string;
  sort?: string;
}

export type PSResourceType = "products" | "categories" | "customers" | "addresses" | "orders" | "stock_availables" | "combinations" | "images" | "tax_rule_groups" | "tax_rules" | "taxes";

export interface PSResourceConnector<T> {
  list(filters?: PSFilters): Promise<T[]>;
  get(id: number): Promise<T>;
  search(query: string): Promise<T[]>;
}
