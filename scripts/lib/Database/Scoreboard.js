import { Entity, Player, ScoreboardObjective, world } from '@minecraft/server'
import { util } from 'smapi.js'

/**
 * @type {Record<import("@minecraft/server").ScoreNames, string>}
 */
const displayNames = {
  joinDate: 'Дата входа',
  joinTimes: 'Кол-во входов',
  leafs: '§aЛистья',
  money: '§6Монеты',
  pvp: 'PVP',
}

/** @type {Record<string, string>} */
const untypedDisplayNames = displayNames

/**
 * @type {Record<string, {player: Player, proxy: any}>}
 */
const players = {}
Reflect.defineProperty(Player.prototype, 'scores', {
  configurable: false,
  enumerable: true,
  get() {
    /** @type {Player} */
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const player = this

    if (players[player.id]) {
      let valid = false
      try {
        valid = players[player.id].player.isValid()
      } catch {}
      if (!valid) players[player.id].player = player

      return players[player.id].proxy
    } else {
      /** @type {(typeof players)[string]} */
      const obj = {
        player,
        proxy: new Proxy(
          {
            leafs: 0,
            money: 0,
          },
          {
            set(_, p, newValue) {
              if (typeof p === 'symbol')
                throw new Error(
                  'Symbol objectives to set are not accepted, recieved ' +
                    util.stringify(p)
                )

              ScoreboardDB.objective(p, untypedDisplayNames[p]).setScore(
                obj.player.id,
                newValue
              )
              return true
            },
            get(_, p) {
              if (typeof p === 'symbol')
                throw new Error(
                  'Symbol objectives to get are not accepted, recieved ' +
                    p.description
                )

              try {
                return (
                  ScoreboardDB.objective(p, untypedDisplayNames[p]).getScore(
                    obj.player.id
                  ) ?? 0
                )
              } catch (e) {
                return 0
              }
            },
          }
        ),
      }

      return (players[player.id] = obj).proxy
    }
  },
})

export class ScoreboardDB {
  /**
   * @type {Record<string, ScoreboardObjective>}
   */
  static objectives = {}

  /**
   * @param {string} name
   */
  static objective(name, displayName = name) {
    if (name in this.objectives) return this.objectives[name]

    return (this.objectives[name] =
      world.scoreboard.getObjective(name) ??
      world.scoreboard.addObjective(name, displayName))
  }

  /**
   * @param {string} name
   * @param {string} [displayName]
   */
  constructor(name, displayName = name) {
    if (name.length > 16) name = name.substring(0, 16)

    this.name = name
    this.scoreboard = ScoreboardDB.objective(name, displayName)
  }
  /**
   * @param {Entity | string} id
   * @param {number} value
   */
  set(id, value) {
    if (typeof id !== 'string') id = id.id
    this.scoreboard.setScore(id, value)
  }
  /**
   * @param {Entity | string} id
   * @param {number} value
   */
  add(id, value) {
    if (typeof id !== 'string') id = id.id
    this.scoreboard.setScore(id, (this.scoreboard.getScore(id) ?? 0) + value)
  }
  /**
   * @param {Entity | string} id
   * @returns {number}
   */
  get(id) {
    if (typeof id !== 'string') id = id.id
    try {
      return this.scoreboard.getScore(id) ?? 0
    } catch (e) {
      return 0
    }
  }

  reset() {
    this.scoreboard.getParticipants().forEach(this.scoreboard.removeParticipant)
  }
}

/*
const objective = new ScoreboardDB('objectiveName', 'display name')

const score = objective.get(player)
objective.set(player, 1)
objective.add(player, 1)

objective.nameSet('custom name', 1)
objective.nameGet('custom name')

objective.reset()
*/
