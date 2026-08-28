import type { UserRole } from '../domain/types'

export type Permission =
  | 'viewDashboard'
  | 'viewStores'
  | 'manageStores'
  | 'reviewDocuments'
  | 'manageSettings'

const permissions: Record<UserRole, ReadonlySet<Permission>> = {
  owner: new Set([
    'viewDashboard',
    'viewStores',
    'manageStores',
    'reviewDocuments',
    'manageSettings',
  ]),
  accountant: new Set([
    'viewDashboard',
    'viewStores',
    'reviewDocuments',
  ]),
}

export function can(role: UserRole, permission: Permission) {
  return permissions[role].has(permission)
}
