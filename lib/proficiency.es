import { getGrowthTarget, isKnownGrowth } from './growth-table'

/** Internal proficiency floor for visible alv 0..7 (>> = 100). */
export const LEVEL_MIN_INTERNAL = [0, 10, 25, 40, 55, 70, 85, 100]

export const ALV_SYMBOLS = ['', '|', '||', '|||', '/', '//', '///', '>>']

export const minCount = (alv, target) => {
  const level = Math.max(0, Math.min(7, alv | 0))
  const t = Math.max(1, target | 0)
  if (level >= 7) return t
  return Math.round((LEVEL_MIN_INTERNAL[level] / 100) * t)
}

export const maxCountExclusive = (alv, target) => {
  const level = Math.max(0, Math.min(7, alv | 0))
  const t = Math.max(1, target | 0)
  if (level >= 7) return t + 1
  return minCount(level + 1, t)
}

export const clampCount = (count, target) =>
  Math.max(0, Math.min(target | 0, count | 0))

/**
 * Reconcile estimated battle count against a freshly observed alv.
 * @param {{ alv?: number, count?: number, target?: number, masterId?: number }} prev
 * @param {number} newAlv
 * @param {number} [masterId]
 */
export const reconcile = (prev, newAlv, masterId) => {
  const mid = masterId != null ? masterId : (prev && prev.masterId)
  const known = isKnownGrowth(mid)
  // Always refresh target from table so newly mapped planes pick up correct denominator
  const target = getGrowthTarget(mid)
  const alv = Math.max(0, Math.min(7, newAlv | 0))
  const oldAlv = prev && prev.alv != null ? (prev.alv | 0) : null
  let count = prev && prev.count != null ? (prev.count | 0) : minCount(alv, target)

  if (oldAlv == null) {
    count = minCount(alv, target)
  } else if (alv < oldAlv) {
    count = minCount(alv, target)
  } else if (alv > oldAlv) {
    const floor = minCount(alv, target)
    if (count < floor) count = floor
    const ceil = maxCountExclusive(alv, target)
    if (count >= ceil && alv < 7) count = ceil - 1
  } else {
    const floor = minCount(alv, target)
    const ceil = maxCountExclusive(alv, target)
    if (count < floor) count = floor
    if (count >= ceil && alv < 7) count = ceil - 1
    if (alv >= 7) count = target
  }

  return {
    masterId: mid,
    alv,
    count: clampCount(count, target),
    target,
    known,
    updatedAt: Date.now(),
  }
}

export const ensureRecord = (prev, masterId, alv = 0) => {
  if (prev && prev.masterId === masterId && prev.target != null) {
    return reconcile(prev, alv != null ? alv : prev.alv, masterId)
  }
  return reconcile(null, alv | 0, masterId)
}

/** Optimistic battle increment. */
export const increment = (prev, delta = 1) => {
  if (!prev) return prev
  const target = prev.target || getGrowthTarget(prev.masterId)
  return {
    ...prev,
    count: clampCount((prev.count | 0) + (delta | 0), target),
    target,
    updatedAt: Date.now(),
  }
}
