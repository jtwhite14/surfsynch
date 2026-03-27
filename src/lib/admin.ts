import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

export const ADMIN_EMAIL = "jtwhite14@gmail.com";

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  return user?.email === ADMIN_EMAIL;
}
