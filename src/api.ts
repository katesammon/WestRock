export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { 'Content-Type': 'application/json' }
          : {},
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error || 'Request failed. Please try again.')
  return result as T
}
export const currency = (cents: number | string = 0, decimals = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(cents) / 100)
export const num = (v: number | string = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(v))
export const today = () => new Date().toLocaleDateString('en-CA')
export const formatDate = (v: string) =>
  new Date(v + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
export const go = (route: string) => {
  window.location.hash = route
}
