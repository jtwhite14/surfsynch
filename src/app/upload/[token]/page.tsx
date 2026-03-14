import { db, uploadSessions } from "@/lib/db";
import { eq, gt, and } from "drizzle-orm";
import { UploadClient } from "./UploadClient";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate the upload session token
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(
      and(
        eq(uploadSessions.token, token),
        gt(uploadSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  // Check if session exists and is not completed
  if (!session || session.status === "completed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">🏄</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            This upload link has expired
          </h1>
          <p className="text-gray-500 text-sm">
            Please scan a new QR code from the SurfSync dashboard to upload
            photos.
          </p>
        </div>
      </div>
    );
  }

  return <UploadClient token={token} />;
}
