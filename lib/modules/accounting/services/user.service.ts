import 'server-only'
import { db } from '@/lib/shared/db'
import type { ErpRole } from '@/lib/generated/prisma/client'

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const

export const UserService = {
  async list() {
    return db.user.findMany({ select: USER_SELECT, orderBy: { createdAt: 'asc' } })
  },

  async findById(id: string) {
    return db.user.findUnique({ where: { id }, select: USER_SELECT })
  },

  async findByUsername(username: string) {
    return db.user.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, isActive: true },
    })
  },

  async findByIdForAudit(id: string) {
    return db.user.findUnique({ where: { id }, select: { id: true, username: true } })
  },

  /**
   * Create a new user with tenant membership.
   * Uses transaction to ensure atomicity.
   */
  async create(data: {
    username: string
    password: string
    email?: string | null
    role: ErpRole
    tenantId: string
  }) {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          password: data.password,
          email: data.email || null,
          role: data.role,
        },
        select: { id: true, username: true, email: true, role: true, isActive: true, createdAt: true },
      })

      await tx.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: data.tenantId,
          role: data.role,
          isActive: true,
        },
      })

      return user
    })

    return result
  },

  async update(id: string, updateData: Record<string, unknown>) {
    return db.user.update({ where: { id }, data: updateData, select: USER_SELECT })
  },

  async setActive(id: string, isActive: boolean) {
    return db.user.update({ where: { id }, data: { isActive }, select: USER_SELECT })
  },

  async count() {
    return db.user.count()
  },

  async createInitialAdmin(data: { username: string; password: string }) {
    return db.user.create({ data: { username: data.username, password: data.password, role: 'admin' } })
  },
}
