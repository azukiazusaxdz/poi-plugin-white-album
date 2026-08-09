import { join } from 'path'
import { ensureDirSync, readJsonSync, writeJsonSync } from 'fs-extra'

export const getStatePath = () => {
  const { APPDATA_PATH } = window
  const dir = join(APPDATA_PATH, 'aircraft-proficiency')
  ensureDirSync(dir)
  return join(dir, 'state.json')
}

export const loadState = () => {
  try {
    const data = readJsonSync(getStatePath())
    if (!data || typeof data !== 'object') {
      return { records: {}, sortie: null, visible: null, expanded: null }
    }
    return {
      records: data.records || {},
      sortie: data.sortie || null,
      visible: data.visible || null,
      expanded: data.expanded || null,
    }
  } catch (e) {
    return { records: {}, sortie: null, visible: null, expanded: null }
  }
}

export const saveState = (state) => {
  try {
    writeJsonSync(getStatePath(), {
      records: state.records || {},
      sortie: state.sortie || null,
      visible: state.visible || null,
    })
  } catch (e) {
    // ignore disk errors
  }
}
