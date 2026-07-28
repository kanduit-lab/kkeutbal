import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ isAdmin: schema.users.isAdmin })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
    return row?.isAdmin ?? false
  } catch (error) {
    console.error('isAdminUser failed:', error)
    return false
  }
}