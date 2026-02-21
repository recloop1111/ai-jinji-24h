// snake_case <-> camelCase converter

function snakeToCamel(str: string) { return str.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()) }
function camelToSnake(str: string) { return str.replace(/[A-Z]/g, (c: string) => "_" + c.toLowerCase()) }

export function toCamel(obj: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) { result[snakeToCamel(key)] = obj[key] }
  return result
}

export function toSnake(obj: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) { result[camelToSnake(key)] = obj[key] }
  return result
}

export function toCamelArray(arr: Record<string, unknown>[]) { return arr.map(item => toCamel(item)) }
