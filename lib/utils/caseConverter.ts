// snake_case <-> camelCase converter

function snakeToCamel(str) { return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) }
function camelToSnake(str) { return str.replace(/[A-Z]/g, c => "_" + c.toLowerCase()) }

export function toCamel(obj) {
  const result = {}
  for (const key of Object.keys(obj)) { result[snakeToCamel(key)] = obj[key] }
  return result
}

export function toSnake(obj) {
  const result = {}
  for (const key of Object.keys(obj)) { result[camelToSnake(key)] = obj[key] }
  return result
}

export function toCamelArray(arr) { return arr.map(item => toCamel(item)) }
