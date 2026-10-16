export const permissions = [
  'rates:read',
  'rates:manage',
  'users:manage',
  'employees:read',
  'projects:create',
  'projects:edit',
  'projects:assign',
  'reports:write',
  'reports:submit',
  'reports:approve',
  'costs:read',
  'audit:read',
] as const
export type Permission = (typeof permissions)[number]
export type Role =
  'owner' | 'admin' | 'project_manager' | 'estimator' | 'foreman'
export const rolePolicy: Record<
  Role,
  {
    permissions: readonly Permission[]
    projects: 'all' | 'assigned'
    reports: 'all' | 'approved' | 'own'
  }
> = {
  owner: { permissions, projects: 'all', reports: 'all' },
  admin: { permissions, projects: 'all', reports: 'all' },
  project_manager: {
    permissions: [
      'rates:read',
      'projects:create',
      'projects:edit',
      'reports:write',
      'reports:submit',
      'reports:approve',
      'costs:read',
    ],
    projects: 'assigned',
    reports: 'all',
  },
  estimator: {
    permissions: ['rates:read', 'costs:read'],
    projects: 'all',
    reports: 'approved',
  },
  foreman: {
    permissions: ['reports:write', 'reports:submit'],
    projects: 'assigned',
    reports: 'own',
  },
}
export function hasPermission(role: string, permission: Permission) {
  return (
    Object.hasOwn(rolePolicy, role) &&
    rolePolicy[role as Role].permissions.includes(permission)
  )
}
