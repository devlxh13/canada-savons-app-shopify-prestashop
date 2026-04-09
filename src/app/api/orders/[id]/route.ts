import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSOrder, PSCustomer } from "@/lib/prestashop/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const psId = parseInt(id);
  if (isNaN(psId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const ps = getPSConnector();
    const order = await ps.get<PSOrder>("orders", psId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let customer: { id: number; firstname: string; lastname: string; email: string } | null = null;
    try {
      const psCustomer = await ps.get<PSCustomer>("customers", parseInt(order.id_customer));
      customer = {
        id: psCustomer.id,
        firstname: psCustomer.firstname,
        lastname: psCustomer.lastname,
        email: psCustomer.email,
      };
    } catch {
      // Customer may have been deleted
    }

    const orderRows = (order.associations?.order_rows ?? []).map((row) => ({
      productId: parseInt(row.product_id),
      productName: row.product_name,
      productQuantity: parseInt(row.product_quantity),
      productPrice: row.product_price,
    }));

    return NextResponse.json({
      psId: order.id,
      reference: order.reference,
      dateAdd: order.date_add,
      currentState: order.current_state,
      payment: order.payment,
      totalProducts: order.total_products,
      totalShipping: order.total_shipping,
      totalPaidTaxIncl: order.total_paid_tax_incl,
      totalPaidTaxExcl: order.total_paid_tax_excl,
      customer,
      orderRows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
