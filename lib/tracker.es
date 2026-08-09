import {
  toPlain, getAlv, isProficiencyAircraft, canGainProficiencyOnLbas, getMaster,
} from './aircraft'
import { ensureRecord, reconcile, increment } from './proficiency'

const parseCsvInts = (value) => {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n))
  return String(value)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n))
}

/** Collect proficiency aircraft instance ids from fleet 1. */
export const collectFleet1AircraftIds = (fleets, ships, equips, $equips) => {
  const f = toPlain(fleets)
  const fleet = Array.isArray(f) ? f[0] : f[0]
  if (!fleet || !fleet.api_ship) return []
  const shipMap = toPlain(ships)
  const equipMap = toPlain(equips)
  const ids = []
  for (const shipId of fleet.api_ship) {
    if (!shipId || shipId < 0) continue
    const ship = shipMap[shipId] || shipMap[String(shipId)]
    if (!ship) continue
    const slots = [...(ship.api_slot || [])]
    if (ship.api_slot_ex > 0) slots.push(ship.api_slot_ex)
    for (const eid of slots) {
      if (!eid || eid <= 0) continue
      const eq = equipMap[eid] || equipMap[String(eid)]
      if (!eq) continue
      const $eq = getMaster($equips, eq.api_slotitem_id)
      if (!isProficiencyAircraft($eq)) continue
      ids.push(eid)
    }
  }
  return ids
}

/** Collect aircraft from all LBAS squadrons. */
export const collectAirbaseAircraftIds = (airbase, equips, $equips) => {
  const bases = toPlain(airbase)
  const list = Array.isArray(bases) ? bases : Object.values(bases)
  const equipMap = toPlain(equips)
  const ids = []
  for (const base of list) {
    if (!base || !base.api_plane_info) continue
    for (const plane of base.api_plane_info) {
      const eid = plane && plane.api_slotid
      if (!eid || eid <= 0) continue
      const eq = equipMap[eid] || equipMap[String(eid)]
      if (!eq) continue
      const $eq = getMaster($equips, eq.api_slotitem_id)
      if (!isProficiencyAircraft($eq)) continue
      ids.push(eid)
    }
  }
  return ids
}

export const syncEquipIds = (records, equipIds, equips, $equips) => {
  const equipMap = toPlain(equips)
  const next = { ...records }
  for (const eid of equipIds) {
    const eq = equipMap[eid] || equipMap[String(eid)]
    if (!eq) continue
    const masterId = eq.api_slotitem_id
    const alv = getAlv(eq)
    const key = String(eid)
    next[key] = ensureRecord(next[key], masterId, alv)
    // always reconcile against latest alv
    next[key] = reconcile(next[key], alv, masterId)
  }
  return next
}

export const incrementEquipIds = (records, equipIds, delta, equips, $equips) => {
  const equipMap = toPlain(equips)
  const next = { ...records }
  for (const eid of equipIds) {
    const key = String(eid)
    const eq = equipMap[eid] || equipMap[String(eid)]
    if (!eq) continue
    const masterId = eq.api_slotitem_id
    const alv = getAlv(eq)
    if (!next[key]) next[key] = ensureRecord(null, masterId, alv)
    next[key] = increment(next[key], delta)
  }
  return next
}

/**
 * Parse LBAS strike plan from api_req_map/start_air_base request.
 * Returns { [baseIndex1based]: { cells: number[], waves: { [cell]: delta } } }
 */
export const parseStrikePlan = (postBody) => {
  const plan = {}
  for (let i = 1; i <= 3; i++) {
    const cells = parseCsvInts(postBody[`api_strike_point_${i}`])
    if (!cells.length) continue
    const waves = {}
    for (const cell of cells) {
      waves[cell] = (waves[cell] || 0) + 1
    }
    plan[i] = { cells, waves }
  }
  return plan
}

/** LBAS equip ids for bases currently set to sortie (action 1) or defense (2). */
export const collectActiveAirbaseAircraft = (airbase, equips, $equips, kinds = [1, 2]) => {
  const bases = toPlain(airbase)
  const list = Array.isArray(bases) ? bases : Object.values(bases)
  const equipMap = toPlain(equips)
  const kindSet = new Set(kinds)
  const byBase = {}
  for (const base of list) {
    if (!base) continue
    const action = base.api_action_kind | 0
    if (!kindSet.has(action)) continue
    const rid = base.api_rid | 0
    const ids = []
    for (const plane of (base.api_plane_info || [])) {
      const eid = plane && plane.api_slotid
      if (!eid || eid <= 0) continue
      // skip empty / relocating
      if ((plane.api_state | 0) !== 1) continue
      if ((plane.api_count | 0) <= 0) continue
      const eq = equipMap[eid] || equipMap[String(eid)]
      if (!eq) continue
      const $eq = getMaster($equips, eq.api_slotitem_id)
      // 陆航计数：排除舰侦/水侦/飞行艇（出击不加熟练度）
      if (!canGainProficiencyOnLbas($eq)) continue
      ids.push(eid)
    }
    if (ids.length) byBase[rid] = { action, ids }
  }
  return byBase
}

/**
 * On a map cell battle, compute LBAS delta for each equip id.
 * strikePlan from start_air_base; cellNo is api_no of the node.
 */
export const lbasDeltasForCell = (strikePlan, activeByBase, cellNo) => {
  const deltas = {} // equipId -> delta
  if (!strikePlan || cellNo == null) return deltas
  for (const [ridStr, basePlan] of Object.entries(strikePlan)) {
    const rid = parseInt(ridStr, 10)
    const active = activeByBase[rid]
    if (!active || active.action !== 1) continue
    const delta = (basePlan.waves && basePlan.waves[cellNo]) || 0
    if (delta <= 0) continue
    for (const eid of active.ids) {
      deltas[eid] = (deltas[eid] || 0) + delta
    }
  }
  return deltas
}

/** Defense: each airbase on action 2 gets +1 per defense battle. */
export const lbasDefenseDeltas = (activeByBase) => {
  const deltas = {}
  for (const base of Object.values(activeByBase || {})) {
    if (!base || base.action !== 2) continue
    for (const eid of base.ids) {
      deltas[eid] = (deltas[eid] || 0) + 1
    }
  }
  return deltas
}

export const applyDeltas = (records, deltas, equips, $equips) => {
  let next = records
  for (const [eid, delta] of Object.entries(deltas || {})) {
    if (!delta) continue
    next = incrementEquipIds(next, [parseInt(eid, 10)], delta, equips, $equips)
  }
  return next
}
