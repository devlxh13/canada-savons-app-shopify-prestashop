import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string; imageId: string }> }
) {
  const { productId, imageId } = await params;

  const apiUrl = process.env.PRESTASHOP_API_URL;
  const apiKey = process.env.PRESTASHOP_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: "PS API not configured" }, { status: 500 });
  }

  const imageUrl = `${apiUrl}images/products/${productId}/${imageId}`;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

  const response = await fetch(imageUrl, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const imageBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
