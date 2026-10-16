import type { Request, Response, NextFunction } from 'express'
import { one, all } from './db.ts'
import { hasPermission, rolePolicy } from '../shared/permissions.ts'
import type { Permission, Role } from '../shared/permissions.ts'
export type Actor = { id: string; company_id: string; role: string }
export function forbid() {
  return Object.assign(
    new Error('You do not have access to this resource or action.'),
    { status: 403 },
  )
}
export const requirePermission =
  (permission: Permission) =>
  (_req: Request, res: Response, next: NextFunction) => {
    if (!hasPermission(res.locals.user.role, permission)) {
      next(forbid())
      return
    }
    next()
  }
export function policy(actor: Actor) {
  if (!Object.hasOwn(rolePolicy, actor.role)) throw forbid()
  // The current installation is single-company. Fail closed for any foreign company binding.
  if (
    one('SELECT id FROM companies ORDER BY created_at LIMIT 1')?.id !==
    actor.company_id
  )
    throw forbid()
  return rolePolicy[actor.role as Role]
}
export function accessibleProjects(actor: Actor) {
  const p = policy(actor)
  return p.projects === 'all'
    ? all('SELECT * FROM projects ORDER BY created_at DESC')
    : all(
        'SELECT p.* FROM projects p JOIN project_members m ON p.id=m.project_id WHERE m.user_id=? ORDER BY p.created_at DESC',
        actor.id,
      )
}
export function requireProject(actor: Actor, id: string) {
  const project = one('SELECT * FROM projects WHERE id=?', id)
  const p = policy(actor)
  if (
    !project ||
    (p.projects === 'assigned' &&
      !one(
        'SELECT 1 FROM project_members WHERE user_id=? AND project_id=?',
        actor.id,
        id,
      ))
  )
    throw forbid()
  return project
}
export function canReadReport(
  actor: Actor,
  report: { project_id: string; author_id: string; status: string },
) {
  requireProject(actor, report.project_id)
  const scope = policy(actor).reports
  if (scope === 'own' && report.author_id !== actor.id) throw forbid()
  if (scope === 'approved' && report.status !== 'approved') throw forbid()
}
export function projectView(actor: Actor, project: any) {
  if (hasPermission(actor.role, 'costs:read')) return project
  const {
    contract_cents: _contract,
    budget_cents: _budget,
    notes: _notes,
    ...fieldProject
  } = project
  return fieldProject
}
export function reportStatus(report: any) {
  return report.status === 'draft' && report.submitted_at
    ? 'submitted'
    : report.status
}
