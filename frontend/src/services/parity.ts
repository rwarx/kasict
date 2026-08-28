// Чётность недели (числитель/знаменатель).
// Правило: неделя 1 сентября = нечётная (числитель).

import type { ReplacementBlockJSON } from '../parser/types'

export const ODD = 'odd' as const
export const EVEN = 'even' as const

export function baseParity(d: Date): string {
  const year = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1
  const sep1 = new Date(year, 8, 1) // 1 сентября
  const anchorMonday = new Date(sep1)
  anchorMonday.setDate(sep1.getDate() - sep1.getDay())
  const weeks = Math.floor((d.getTime() - anchorMonday.getTime()) / (7 * 86400000))
  return weeks % 2 === 0 ? ODD : EVEN
}

export class ParityResolver {
  private flip = false
  private calibratedOn: Date | null = null
  warnings: string[] = []

  calibrate(d: Date, declaredParity: string | null) {
    if (declaredParity !== ODD && declaredParity !== EVEN) return
    const actual = baseParity(d)
    const flip = actual !== declaredParity
    if (this.calibratedOn !== null && flip !== this.flip) {
      this.warnings.push(
        `Конфликт чётности: ${d.toISOString().slice(0, 10)} объявлена «${declaredParity}»`,
      )
    }
    this.flip = flip
    this.calibratedOn = d
  }

  parity(d: Date): string {
    const p = baseParity(d)
    return this.flip ? (p === ODD ? EVEN : ODD) : p
  }
}

export function createResolverFromBlocks(blocks: ReplacementBlockJSON[]): ParityResolver {
  const r = new ParityResolver()
  for (const b of blocks) {
    r.calibrate(new Date(b.date + 'T12:00:00'), b.parity)
  }
  return r
}
