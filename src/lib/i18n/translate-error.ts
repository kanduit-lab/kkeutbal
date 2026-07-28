import type { Dictionary } from './dictionaries/ko'

export function translateError(d: Dictionary, message: string): string {
  if (message.startsWith('errors.')) {
    const key = message.slice('errors.'.length) as keyof Dictionary['errors']
    return d.errors[key] ?? message
  }
  return message
}