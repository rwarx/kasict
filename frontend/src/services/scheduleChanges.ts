import type { ReplacementBlockJSON, ScheduleJSON } from '../parser/types'

export interface DataChangeSummary {
  added: number
  cancelled: number
  changed: number
  teacherChanged: number
  roomChanged: number
  dates: string[]
}

function emptySummary(): DataChangeSummary {
  return { added: 0, cancelled: 0, changed: 0, teacherChanged: 0, roomChanged: 0, dates: [] }
}

function addDate(summary: DataChangeSummary, date: string) {
  if (!summary.dates.includes(date)) summary.dates.push(date)
}

function replacementKey(date: string, group: string, rawPairs: string, lessonNumbers: number[]) {
  return `${date}|${group}|${lessonNumbers.join(',')}|${rawPairs}`
}

/** Compares two downloaded snapshots without changing the source data contract. */
export function summarizeScheduleChanges(
  previousSchedule: ScheduleJSON | null,
  currentSchedule: ScheduleJSON,
  previousReplacements: ReplacementBlockJSON[] | null,
  currentReplacements: ReplacementBlockJSON[],
): DataChangeSummary {
  const summary = emptySummary()

  if (previousSchedule) {
    const groups = new Set([...Object.keys(previousSchedule.lessons), ...Object.keys(currentSchedule.lessons)])
    groups.forEach(group => {
      const oldDays = previousSchedule.lessons[group] ?? {}
      const newDays = currentSchedule.lessons[group] ?? {}
      for (const weekday of new Set([...Object.keys(oldDays), ...Object.keys(newDays)])) {
        const oldPairs = oldDays[weekday] ?? {}
        const newPairs = newDays[weekday] ?? {}
        for (const pair of new Set([...Object.keys(oldPairs), ...Object.keys(newPairs)])) {
          const oldPair = oldPairs[pair]
          const newPair = newPairs[pair]
          for (const parity of ['odd', 'even'] as const) {
            const before = oldPair?.[parity]
            const after = newPair?.[parity]
            const beforeHas = Boolean(before?.subject)
            const afterHas = Boolean(after?.subject)
            if (!beforeHas && afterHas) summary.added++
            else if (beforeHas && !afterHas) summary.cancelled++
            else if (beforeHas && afterHas && before && after && (before.subject !== after.subject || before.teacher !== after.teacher || before.classroom !== after.classroom)) {
              summary.changed++
              if (before.teacher !== after.teacher) summary.teacherChanged++
              if (before.classroom !== after.classroom) summary.roomChanged++
            }
          }
        }
      }
    })
  }

  if (previousReplacements) {
    const oldByKey = new Map<string, { teacher: string; classroom: string; isCancel: boolean }>()
    previousReplacements.forEach(block => block.replacements.forEach(rep => {
      oldByKey.set(replacementKey(block.date, rep.group, rep.raw_pairs, rep.lesson_numbers), {
        teacher: rep.teacher,
        classroom: rep.classroom,
        isCancel: rep.is_cancel,
      })
    }))

    currentReplacements.forEach(block => block.replacements.forEach(rep => {
      const key = replacementKey(block.date, rep.group, rep.raw_pairs, rep.lesson_numbers)
      const old = oldByKey.get(key)
      if (!old) {
        addDate(summary, block.date)
        if (rep.is_cancel) summary.cancelled++
        else {
          summary.changed++
          if (rep.teacher) summary.teacherChanged++
          if (rep.classroom) summary.roomChanged++
        }
      } else if (old.teacher !== rep.teacher || old.classroom !== rep.classroom || old.isCancel !== rep.is_cancel) {
        addDate(summary, block.date)
        summary.changed++
        if (old.teacher !== rep.teacher) summary.teacherChanged++
        if (old.classroom !== rep.classroom) summary.roomChanged++
      }
    }))
  }

  summary.dates.sort()
  return summary
}
