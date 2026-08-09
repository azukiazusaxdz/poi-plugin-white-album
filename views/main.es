import React, { Component } from 'react'
import { connect } from 'react-redux'
import { join } from 'path'
import { SlotitemIcon } from 'views/components/etc/icon'

import { toPlain, getAlv, getMaster, isProficiencyAircraft } from '../lib/aircraft'
import { loadState, saveState } from '../lib/persist'
import {
  collectFleet1AircraftIds,
  collectAirbaseAircraftIds,
  syncEquipIds,
  incrementEquipIds,
  parseStrikePlan,
  collectActiveAirbaseAircraft,
  lbasDeltasForCell,
  lbasDefenseDeltas,
  applyDeltas,
} from '../lib/tracker'

const RESULT_PATHS = new Set([
  '/kcsapi/api_req_sortie/battleresult',
  '/kcsapi/api_req_combined_battle/battleresult',
])

const PRACTICE_PATHS = new Set([
  '/kcsapi/api_req_practice/battle',
  '/kcsapi/api_req_practice/midnight_battle',
  '/kcsapi/api_req_practice/battle_result',
])

const SYNC_PATHS = new Set([
  '/kcsapi/api_port/port',
  '/kcsapi/api_get_member/mapinfo',
  '/kcsapi/api_get_member/base_air_corps',
  '/kcsapi/api_get_member/require_info',
  '/kcsapi/api_get_member/slot_item',
])

const ACTION_LABEL = {
  0: '待机', 1: '出击', 2: '防空', 3: '退避', 4: '休息',
}

/** api_area_id: 5 南西諸島 / 7 南西方面 / 6 中部 / 其它活动 */
const areaGroupOf = (areaId) => {
  const id = areaId | 0
  if (id === 5 || id === 7) return 'nansei'
  if (id === 6) return 'chubu'
  return 'event'
}

const PANEL_KEYS = [
  { key: 'fleet1', label: '第一舰队' },
  { key: 'event', label: '活动海域' },
  { key: 'chubu', label: '中部海域' },
  { key: 'nansei', label: '南西海域' },
]

const DEFAULT_VISIBLE = {
  fleet1: true,
  event: true,
  chubu: true,
  nansei: true,
}

const alvImgSrc = (alv) => {
  if (!alv || alv < 1) return null
  const root = (typeof window !== 'undefined' && window.ROOT) || ''
  return join(root, 'assets', 'img', 'airplane', `alv${alv}.png`)
}

class AircraftProficiencyView extends Component {
  state = {
    records: {},
    sortie: null,
    visible: { ...DEFAULT_VISIBLE },
  }

  componentDidMount() {
    const saved = loadState()
    // migrate old expanded -> visible
    const savedVisible = saved.visible || saved.expanded || {}
    this.setState({
      records: saved.records || {},
      sortie: saved.sortie || null,
      visible: { ...DEFAULT_VISIBLE, ...savedVisible },
    }, () => this.syncVisible())
    window.addEventListener('game.response', this.handleResponse)
    window.addEventListener('game.request', this.handleRequest)
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.fleets !== this.props.fleets
      || prevProps.equips !== this.props.equips
      || prevProps.airbase !== this.props.airbase
    ) {
      // Initialize newly equipped planes without waiting for the next API tick
      const { fleets, ships, equips, airbase, $equips } = this.getGameData()
      const ids = [
        ...collectFleet1AircraftIds(fleets, ships, equips, $equips),
        ...collectAirbaseAircraftIds(airbase, equips, $equips),
      ]
      const missing = ids.filter((id) => !this.state.records[String(id)])
      if (missing.length) {
        const records = syncEquipIds(this.state.records, missing, equips, $equips)
        this.setRecords(records)
      }
    }
  }

  componentWillUnmount() {
    window.removeEventListener('game.response', this.handleResponse)
    window.removeEventListener('game.request', this.handleRequest)
    this.persist()
  }

  persist = () => {
    saveState({
      records: this.state.records,
      sortie: this.state.sortie,
      visible: this.state.visible,
    })
  }

  setRecords = (records, sortie = this.state.sortie) => {
    this.setState({ records, sortie }, this.persist)
  }

  toggleVisible = (key) => {
    this.setState((prev) => ({
      visible: {
        ...prev.visible,
        [key]: !prev.visible[key],
      },
    }), this.persist)
  }

  getGameData = () => {
    const store = typeof window !== 'undefined' && window.getStore
      ? window.getStore()
      : null
    const fleets = (store && store.info && store.info.fleets) || this.props.fleets
    const ships = (store && store.info && store.info.ships) || this.props.ships
    const equips = (store && store.info && store.info.equips) || this.props.equips
    const airbase = (store && store.info && store.info.airbase) || this.props.airbase
    const $equips = (store && store.const && store.const.$equips) || this.props.$equips
    const $ships = (store && store.const && store.const.$ships) || this.props.$ships
    return { fleets, ships, equips, airbase, $equips, $ships }
  }

  syncVisible = () => {
    const { fleets, ships, equips, airbase, $equips } = this.getGameData()
    const ids = [
      ...collectFleet1AircraftIds(fleets, ships, equips, $equips),
      ...collectAirbaseAircraftIds(airbase, equips, $equips),
    ]
    if (!ids.length) return
    const records = syncEquipIds(this.state.records, ids, equips, $equips)
    this.setRecords(records)
  }

  handleRequest = (e) => {
    const { path, body } = e.detail || {}
    if (path === '/kcsapi/api_req_map/start') {
      const deckId = parseInt(body && body.api_deck_id, 10) || 1
      this.setState({
        sortie: {
          deckId,
          cell: null,
          practice: false,
          strikePlan: (this.state.sortie && this.state.sortie.strikePlan) || null,
        },
      }, this.persist)
    }
    if (path === '/kcsapi/api_req_map/start_air_base') {
      const strikePlan = parseStrikePlan(body || {})
      const prev = this.state.sortie || {}
      this.setState({
        sortie: { ...prev, strikePlan },
      }, this.persist)
    }
  }

  handleResponse = (e) => {
    const { path, body } = e.detail || {}
    if (!path) return

    if (PRACTICE_PATHS.has(path)) {
      const prev = this.state.sortie || {}
      this.setState({
        sortie: { ...prev, practice: true },
      }, this.persist)
      return
    }

    if (path === '/kcsapi/api_req_map/start' || path === '/kcsapi/api_req_map/next') {
      const apiNo = body && body.api_no
      if (apiNo != null) {
        const prev = this.state.sortie || { deckId: 1 }
        this.setState({
          sortie: { ...prev, cell: apiNo, practice: false },
        }, this.persist)
      }
      return
    }

    if (SYNC_PATHS.has(path)) {
      // port clears sortie
      if (path === '/kcsapi/api_port/port') {
        this.setState({ sortie: null }, () => {
          this.syncVisible()
        })
        return
      }
      this.syncVisible()
      return
    }

    if (!RESULT_PATHS.has(path)) return

    const sortie = this.state.sortie
    if (sortie && sortie.practice) return

    const { fleets, ships, equips, airbase, $equips } = this.getGameData()
    let records = this.state.records

    // Fleet 1 aircraft: +1 on each battle result while deck 1 is sortieing
    const deckId = (sortie && sortie.deckId) || 1
    if (deckId === 1) {
      const fleetIds = collectFleet1AircraftIds(fleets, ships, equips, $equips)
      records = incrementEquipIds(records, fleetIds, 1, equips, $equips)
    }

    // LBAS: concentrate/disperse by strike plan; fallback +1 if sortie without plan; defense +1
    const active = collectActiveAirbaseAircraft(airbase, equips, $equips, [1, 2])
    const cell = sortie && sortie.cell
    const strikePlan = sortie && sortie.strikePlan
    const hasPlan = strikePlan && Object.keys(strikePlan).length > 0
    let deltas = {}
    if (hasPlan && cell != null) {
      deltas = lbasDeltasForCell(strikePlan, active, cell)
    } else {
      const def = lbasDefenseDeltas(active)
      for (const [k, v] of Object.entries(def)) deltas[k] = (deltas[k] || 0) + v
      // Sortie bases with no recorded strike plan: +1 per battle (cannot know concentrate)
      for (const info of Object.values(active)) {
        if (!info || info.action !== 1) continue
        for (const eid of info.ids) {
          deltas[eid] = (deltas[eid] || 0) + 1
        }
      }
    }

    records = applyDeltas(records, deltas, equips, $equips)
    this.setRecords(records, sortie)
  }

  renderAlv = (alv) => {
    const src = alvImgSrc(alv)
    if (!src) {
      return <span className="ap-alv-0">·</span>
    }
    return <img className="ap-alv-img" src={src} alt={`alv${alv}`} />
  }

  renderPlaneRow = (equipId, equips, $equips, records) => {
    const equipMap = toPlain(equips)
    const eq = equipMap[equipId] || equipMap[String(equipId)]
    if (!eq) return null
    const masterId = eq.api_slotitem_id
    const $eq = getMaster($equips, masterId)
    if (!isProficiencyAircraft($eq)) return null
    const name = ($eq && $eq.api_name) || `#${masterId}`
    const iconId = ($eq && $eq.api_type && $eq.api_type[3]) || 0
    const liveAlv = getAlv(eq)
    const rec = records[String(equipId)]
    const alv = rec ? rec.alv : liveAlv
    const count = rec ? rec.count : 0
    const target = rec ? rec.target : 100
    const known = rec ? !!rec.known : false
    const isMax = known && (count >= target || alv >= 7)

    return (
      <div key={equipId} className="ap-row">
        <SlotitemIcon slotitemId={iconId} className="ap-icon" />
        <div className="ap-name" title={name}>{name}</div>
        <div className="ap-alv">{this.renderAlv(alv)}</div>
        <div className={`ap-count${isMax ? ' is-max' : ''}${known ? '' : ' is-unknown'}`}>
          {known ? `${count}/${target}` : '??/??'}
        </div>
      </div>
    )
  }

  collectFleetPlaneGroups = () => {
    const { fleets, ships, equips, $equips, $ships } = this.getGameData()
    const f = toPlain(fleets)
    const fleet = Array.isArray(f) ? f[0] : f[0]
    if (!fleet || !fleet.api_ship) return { groups: [], total: 0 }
    const shipMap = toPlain(ships)
    const $shipMap = toPlain($ships)
    const equipMap = toPlain(equips)
    const groups = []
    let total = 0
    fleet.api_ship.forEach((shipId, idx) => {
      if (!shipId || shipId < 0) return
      const ship = shipMap[shipId] || shipMap[String(shipId)]
      if (!ship) return
      const $ship = $shipMap[ship.api_ship_id] || $shipMap[String(ship.api_ship_id)] || {}
      const shipName = $ship.api_name || `舰${idx + 1}`
      const slots = [...(ship.api_slot || [])]
      if (ship.api_slot_ex > 0) slots.push(ship.api_slot_ex)
      const planeIds = slots.filter((eid) => {
        if (!eid || eid <= 0) return false
        const eq = equipMap[eid] || equipMap[String(eid)]
        if (!eq) return false
        return isProficiencyAircraft(getMaster($equips, eq.api_slotitem_id))
      })
      if (!planeIds.length) return
      total += planeIds.length
      groups.push({
        key: shipId,
        title: `${idx + 1}. ${shipName}`,
        planeIds,
        kind: 'ship',
      })
    })
    return { groups, total }
  }

  collectAirbaseGroups = (groupKey) => {
    const { airbase, equips, $equips } = this.getGameData()
    const bases = toPlain(airbase)
    const list = Array.isArray(bases) ? bases : Object.values(bases || {})
    const equipMap = toPlain(equips)
    const groups = []
    let total = 0
    list.forEach((base) => {
      if (!base || !base.api_plane_info) return
      if (areaGroupOf(base.api_area_id) !== groupKey) return
      const planeIds = []
      for (const plane of base.api_plane_info) {
        const eid = plane && plane.api_slotid
        if (!eid || eid <= 0) continue
        if ((plane.api_state | 0) === 0) continue
        const eq = equipMap[eid] || equipMap[String(eid)]
        if (!eq) continue
        if (!isProficiencyAircraft(getMaster($equips, eq.api_slotitem_id))) continue
        planeIds.push(eid)
      }
      if (!planeIds.length) return
      total += planeIds.length
      const title = `${base.api_name || `航空队${base.api_rid}`}（${ACTION_LABEL[base.api_action_kind] || base.api_action_kind}）`
      groups.push({
        key: `${base.api_area_id}-${base.api_rid}`,
        title,
        planeIds,
        kind: 'base',
      })
    })
    return { groups, total }
  }

  renderGroups = (groups, emptyText) => {
    const { equips, $equips } = this.getGameData()
    const { records } = this.state
    if (!groups.length) {
      return <div className="ap-empty">{emptyText}</div>
    }
    return groups.map((g) => (
      <div key={g.key}>
        <div className={g.kind === 'base' ? 'ap-base' : 'ap-ship'}>{g.title}</div>
        {g.planeIds.map((eid) => this.renderPlaneRow(eid, equips, $equips, records))}
      </div>
    ))
  }

  renderPanel = (key, title, groups, emptyText) => {
    if (!this.state.visible[key]) return null
    return (
      <div className="ap-panel" key={key}>
        <div className="ap-panel-head">
          <span>{title}</span>
        </div>
        <div className="ap-panel-body">
          {this.renderGroups(groups, emptyText)}
        </div>
      </div>
    )
  }

  renderToggles = () => (
    <div className="ap-toggles">
      {PANEL_KEYS.map(({ key, label }) => {
        const on = !!this.state.visible[key]
        return (
          <button
            key={key}
            type="button"
            className={`ap-toggle${on ? ' is-on' : ''}`}
            onClick={() => this.toggleVisible(key)}
            title={on ? `隐藏${label}（仍计数）` : `显示${label}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )

  render() {
    const fleet = this.collectFleetPlaneGroups()
    const event = this.collectAirbaseGroups('event')
    const chubu = this.collectAirbaseGroups('chubu')
    const nansei = this.collectAirbaseGroups('nansei')

    return (
      <div id="aircraft-proficiency">
        <link rel="stylesheet" href={join(__dirname, '../assets/style.css')} />
        <div className="ap-header">
          <div className="ap-title">熟练度计数</div>
        </div>
        {this.renderToggles()}
        {this.renderPanel('fleet1', '第一舰队', fleet.groups, '第一舰队没有可刷熟练度的飞机')}
        {this.renderPanel('event', '活动海域', event.groups, '无活动海域陆航飞机')}
        {this.renderPanel('chubu', '中部海域', chubu.groups, '无中部海域陆航飞机')}
        {this.renderPanel('nansei', '南西海域', nansei.groups, '无南西海域陆航飞机')}
      </div>
    )
  }
}

export default connect((state) => ({
  fleets: (state.info && state.info.fleets) || [],
  ships: (state.info && state.info.ships) || {},
  equips: (state.info && state.info.equips) || {},
  airbase: (state.info && state.info.airbase) || [],
  $equips: (state.const && state.const.$equips) || {},
  $ships: (state.const && state.const.$ships) || {},
}))(AircraftProficiencyView)
