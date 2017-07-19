import * as types from '../mutation-types'
import {WowsApi} from '../wows-api'

const jsonfile = require('jsonfile')
const path = require('path')

const state = {
  active: false,
  hasData: false,
  arena: {
    mapname: '',
    playerName: '',
    lastMatchDate: '',
    matchGroup: ''
  },
  players: [],
  playerNames: {}
}

const shipnames = new Map()

const getters = {
  friends () {
    return state.players.filter(player => player.relation <= 1)
  },

  foes () {
    return state.players.filter(player => player.relation > 1)
  },

  players () {
    return state.players
  }
}

const mutations = {
  [types.SET_ARENA_ACTIVE] (state, isActive) {
    state.active = isActive
    if (!isActive) {
      state.arena.lastMatchDate = ''
    }
  },

  [types.SET_ARENA_DATA] (state, arenaData) {
    state.arena = {
      mapname: arenaData.mapDisplayName,
      playerName: arenaData.playerName,
      lastMatchDate: arenaData.dateTime,
      matchGroup: arenaData.matchGroup
      // dateTime:"04.07.2017 15:26:52"
      // duration:1200
      // gameLogic:"Domination"
      // gameMode:7
      // logic:"Domination"
      // mapDisplayName:"17_NA_fault_line"
      // mapId:11
      // mapName:"spaces/17_NA_fault_line"
      // matchGroup:"ranked"
      // name:"7x7"
      // playerID:0
      // playerName:"rottzorr"
      // playerVehicle:"PJSB006-Fuso-1943"
      // playersPerTeam:7
      // scenario:"Ranked_Domination"
      // scenarioConfigId:90
      // teamsCount:2
    }
    state.hasData = true
  },

  [types.INITIALIZE_PLAYER_DATA] (state, playerList) {
    const newPlayers = []
    const newPlayerNames = {}
    for (const player of playerList) {
      // Keep a lookup table from player names to indices
      newPlayerNames[player.name] = newPlayers.length
      newPlayers.push({
        playerName: player.name,
        playerHasRecord: false,
        playerBattles: 0,
        playerWinrate: 0,
        playerAvgExp: 0,
        playerAvgDmg: 0,
        playerKdRatio: 0.0,
        playerFinishedLoading: false,
        playerError: [],
        shipId: player.shipId,
        shipHasRecord: false,
        shipName: '',
        shipBattles: 0,
        shipVictories: 0,
        shipSurvived: 0,
        shipFrags: 0,
        shipAvgExp: 0,
        shipAvgDmg: 0,
        shipKdRatio: 0.0,
        shipFinishedLoading: false,
        shipError: [],
        relation: player.relation
      })
    }
    state.players = newPlayers
    state.playerNames = newPlayerNames
  },

  [types.SET_PLAYER_DATA] (state, { name, data }) {
    Object.assign(state.players[state.playerNames[name]], data)
  }
}

const actions = {
  readArenaData ({ state, dispatch, commit, rootState }) {
    const arenaJson = path.resolve(rootState.Settings.wows.path, 'replays/tempArenaInfo.json')
    jsonfile.readFile(arenaJson, (error, obj) => {
      if (error) {
        console.log(error)
        commit(types.SET_ARENA_ACTIVE, false)
      } else {
        if (state.arena.lastMatchDate !== obj.dateTime) {
          commit(types.SET_ARENA_DATA, obj)
          commit(types.SET_ARENA_ACTIVE, true)
          commit(types.INITIALIZE_PLAYER_DATA, obj.vehicles)
          dispatch('resolvePlayers')
        }
      }
    })
  },

  resolvePlayers ({ state, dispatch, commit }) {
    for (const player of state.players) {
      dispatch('resolvePlayer', player)
    }
  },

  resolvePlayer ({ state, commit, rootState }, player) {
    const wows = new WowsApi(rootState.Settings.wows.api.key, rootState.Settings.wows.api.url)
    // Resolve the ship's name first
    if (shipnames.has(player.shipId)) {
      commit(types.SET_PLAYER_DATA, {
        name: player.playerName,
        data: {
          shipName: shipnames.get(player.shipId)
        }
      })
    } else {
      wows.getShipName(player.shipId)
      .then(shipName => {
        commit(types.SET_PLAYER_DATA, {
          name: player.playerName,
          data: {
            shipName: shipName
          }
        })
        shipnames.set(player.shipId, shipName)
      })
      .catch(error => {
        console.log(error)
      })
    }

    // Get the player's account ID and stats next
    console.log('Resolve player ' + player.playerName)

    // Select the correct match group
    let matchGroup = rootState.Settings.wows.matchgroup
    if (matchGroup === 'auto') {
      matchGroup = state.arena.matchGroup
    }

    wows.getPlayer(player.playerName, matchGroup)
      .then(playerData => {
        commit(types.SET_PLAYER_DATA, {
          name: player.playerName,
          data: {
            playerFinishedLoading: true,
            playerHasRecord: true,
            ...playerData
          }
        })
        // Then get the ship's stats
        wows.getPlayerShip(player.shipId, player.accountId, matchGroup)
          .then(shipData => {
            commit(types.SET_PLAYER_DATA, {
              name: player.playerName,
              data: {
                shipFinishedLoading: true,
                shipHasRecord: true,
                ...shipData
              }
            })
          })
        .catch(error => {
          commit(types.SET_PLAYER_DATA, {
            name: player.playerName,
            data: {
              shipFinishedLoading: true,
              shipHasRecord: false,
              errors: [error]
            }
          })
          console.log(error)
        })
      })
      .catch(error => {
        commit(types.SET_PLAYER_DATA, {
          name: player.playerName,
          data: {
            playerFinishedLoading: true,
            shipFinishedLoading: true,
            playerHasRecord: false,
            shipHasRecord: false,
            errors: [error]
          }
        })
        console.log(error)
      })
  }
}

export default {
  state,
  getters,
  mutations,
  actions
}
