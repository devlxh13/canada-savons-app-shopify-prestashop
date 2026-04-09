import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSCustomer, PSAddress, PSOrder } from "@/lib/prestashop/types";

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

    const [customer, addresses, orders] = await Promise.all([
      ps.get<PSCustomer>("customers", psId),
      ps.list<PSAddress>("addresses", { display: "full", filter: { id_customer: String(psId) } }),
      ps.list<PSOrder>("orders", { display: "full", filter: { id_customer: String(psId) } }),
    ]);

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      psId: customer.id,
      firstname: customer.firstname,
      lastname: customer.lastname,
      email: customer.email,
      active: customer.active === "1",
      dateAdd: customer.date_add,
      addresses: addresses.map((a) => ({
        address1: a.address1,
        address2: a.address2 || null,
        city: a.city,
        postcode: a.postcode,
        phone: a.phone || a.phone_mobile || null,
        company: a.company || null,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        totalPaid: o.total_paid,
        dateAdd: o.date_add,
        currentState: o.current_state,
        payment: o.payment,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
