import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { resolveUser } from "@/lib/auth";

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkWebhookUserData {
  id: string;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

function getEmail(data: ClerkWebhookUserData): string | undefined {
  const primary = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  return primary?.email_address ?? data.email_addresses[0]?.email_address;
}

function getName(data: ClerkWebhookUserData): string | undefined {
  const parts = [data.first_name, data.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await request.text();

  const wh = new Webhook(webhookSecret);
  let event: { type: string; data: ClerkWebhookUserData };

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const data = event.data;
    const email = getEmail(data);
    const name = getName(data);

    await resolveUser(data.id, email, name, data.image_url ?? undefined);
  }

  return NextResponse.json({ received: true });
}
