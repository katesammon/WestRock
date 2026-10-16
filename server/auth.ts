import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { one, run } from './db.ts'
import { rolePolicy } from '../shared/permissions.ts'
import type { Role } from '../shared/permissions.ts'
export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(':')
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(value, 'hex'),
  )
}
export const tokenHash = (value: string) =>
  createHash('sha256').update(value).digest('hex')
export const safeUser = (user: any) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: Object.hasOwn(rolePolicy, user.role)
    ? rolePolicy[user.role as Role].permissions
    : [],
})
export function session(res: Response, userId: string) {
  const token = randomBytes(32).toString('hex')
  run('DELETE FROM sessions WHERE expires_at<?', Date.now())
  run(
    'INSERT INTO sessions VALUES (?,?,?)',
    tokenHash(token),
    userId,
    Date.now() + 12 * 60 * 60 * 1000,
  )
  res.cookie('westrock_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  })
}
export function tokenFrom(req: Request) {
  return (
    req.headers.cookie
      ?.split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('westrock_session='))
      ?.slice('westrock_session='.length) || ''
  )
}
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const user = one(
    'SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1',
    tokenHash(tokenFrom(req)),
    Date.now(),
  )
  const company = one('SELECT id FROM companies ORDER BY created_at LIMIT 1')
  if (
    !user ||
    !Object.hasOwn(rolePolicy, user.role) ||
    user.company_id !== company?.id
  ) {
    res.status(401).json({ error: 'Please sign in.' })
    return
  }
  res.locals.user = user
  next()
}
const attempts = new Map<string, { count: number; until: number }>()
export function throttle(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'local'
  const now = Date.now()
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k)
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 }
  entry.count++
  attempts.set(key, entry)
  if (entry.count > 20) {
    res
      .status(429)
      .json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' })
    return
  }
  next()
}
