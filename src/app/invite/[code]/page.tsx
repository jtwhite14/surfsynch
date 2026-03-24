import { auth } from "@clerk/nextjs/server";
import { InviteClient } from "./invite-client";

interface InvitePageProps {
  params: Promise<{ code: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { code } = await params;
  const { userId: clerkUserId } = await auth();

  return <InviteClient code={code} isAuthenticated={!!clerkUserId} />;
}
