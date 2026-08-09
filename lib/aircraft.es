/** Equip type[2] that can gain aircraft proficiency. */
export const PROFICIENCY_TYPES = new Set([
  6,  // 艦戦
  7,  // 艦爆
  8,  // 艦攻
  9,  // 艦偵
  10, // 水偵
  11, // 水爆
  25, // オートジャイロ
  26, // 対潜哨戒機
  41, // 大型飛行艇
  45, // 水戦
  47, // 陸攻
  48, // 局戦 / 陸戦
  49, // 陸偵
  56, // 噴式戦闘爆撃機
  57, // 噴式攻撃機
])

export const toPlain = (obj) => {
  if (!obj) return {}
  if (typeof obj.toJS === 'function') return obj.toJS()
  return obj
}

export const getAlv = (equip) => {
  if (!equip) return 0
  const alv = equip.api_alv
  return alv == null ? 0 : (alv | 0)
}

export const isProficiencyAircraft = ($equip) => {
  if (!$equip || !$equip.api_type) return false
  return PROFICIENCY_TYPES.has(($equip.api_type[2]) | 0)
}

/**
 * 陆航不做出索敌：舰侦 / 水侦 / 大型飞行艇（如 Catalina、二式大艇）出击/防空都不加熟练度。
 * 陆侦(49) 2023/02 后可上升，不在此列。
 */
export const LBAS_NO_GAIN_TYPES = new Set([
  9,  // 艦偵
  10, // 水偵
  41, // 大型飛行艇
])

export const canGainProficiencyOnLbas = ($equip) => {
  if (!isProficiencyAircraft($equip)) return false
  const type2 = ($equip.api_type[2]) | 0
  return !LBAS_NO_GAIN_TYPES.has(type2)
}

export const getMaster = ($equips, masterId) => {
  const raw = toPlain($equips)
  return raw[masterId] || raw[String(masterId)] || null
}
