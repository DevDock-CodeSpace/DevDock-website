// Validates what the model sent against a tool's input schema. The model's
// arguments are never trusted: every tool call goes through here first, and
// the cleaned copy (known keys only, strings trimmed) is what the tool gets.

import type { JsonSchema } from './types.ts'

export type Validation = { ok: true; value: unknown } | { ok: false; errors: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** A real calendar date written YYYY-MM-DD. */
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function check(schema: JsonSchema, value: unknown, path: string, errors: string[]): unknown {
  const at = path || 'arguments'
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') return void errors.push(`${at} must be text`)
      const text = value.trim()
      if (schema.enum && !schema.enum.includes(text)) return void errors.push(`${at} must be one of: ${schema.enum.join(', ')}`)
      if (text.length < (schema.minLength ?? 0)) return void errors.push(`${at} is too short`)
      if (schema.maxLength !== undefined && text.length > schema.maxLength) {
        return void errors.push(`${at} is longer than ${schema.maxLength} characters`)
      }
      if (schema.format === 'uuid' && !UUID.test(text)) return void errors.push(`${at} must be an id returned by a tool`)
      if (schema.format === 'date' && !isDate(text)) return void errors.push(`${at} must be a date written YYYY-MM-DD`)
      if (schema.format === 'date-time' && Number.isNaN(Date.parse(text))) {
        return void errors.push(`${at} must be an ISO 8601 date and time`)
      }
      return text
    }
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return void errors.push(`${at} must be a number`)
      if (schema.type === 'integer' && !Number.isInteger(value)) return void errors.push(`${at} must be a whole number`)
      if (schema.minimum !== undefined && value < schema.minimum) return void errors.push(`${at} must be at least ${schema.minimum}`)
      if (schema.maximum !== undefined && value > schema.maximum) return void errors.push(`${at} must be at most ${schema.maximum}`)
      return value
    }
    case 'boolean':
      if (typeof value !== 'boolean') return void errors.push(`${at} must be true or false`)
      return value
    case 'array': {
      if (!Array.isArray(value)) return void errors.push(`${at} must be a list`)
      if (value.length < (schema.minItems ?? 0)) return void errors.push(`${at} needs at least ${schema.minItems} item(s)`)
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        return void errors.push(`${at} can have at most ${schema.maxItems} items`)
      }
      return value.map((item, index) => check(schema.items, item, `${path}[${index}]`, errors))
    }
    case 'object': {
      if (!isPlainObject(value)) return void errors.push(`${at} must be an object`)
      const out: Record<string, unknown> = {}
      for (const [key, property] of Object.entries(schema.properties)) {
        const given = value[key]
        // Models send null or "" for "not set"; both mean the argument is absent.
        if (given === undefined || given === null || given === '') {
          if (schema.required?.includes(key)) errors.push(`${path ? `${path}.` : ''}${key} is required`)
          continue
        }
        out[key] = check(property, given, path ? `${path}.${key}` : key, errors)
      }
      return out
    }
  }
}

/** Unknown keys are dropped rather than refused: models add them, and no tool reads them. */
export function validate(schema: JsonSchema, value: unknown): Validation {
  const errors: string[] = []
  const cleaned = check(schema, value ?? {}, '', errors)
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: cleaned }
}
