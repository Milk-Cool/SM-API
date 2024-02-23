import { Entity, Player, Vector, system, world } from '@minecraft/server'
import { Airdrop } from 'lib/Airdrop.js'
import { LootTable } from 'lib/LootTable.js'
import { Compass } from 'lib/Menu.js'
import { Temporary } from 'lib/Temporary.js'
import { isBuilding } from 'modules/Build/isBuilding.js'
import { PlaceAction } from './Action.js'

// // @ts-expect-error Bruh
// Set.prototype.toJSON = function () {
//   return 'Set<size=' + this.size + '>'
// }

/**
 * @typedef {{
 * 	active: string,
 * 	completed?: string[],
 * 	step?: number,
 * 	additional?: unknown
 * }} QuestDB
 */

export class Quest {
  static error = class QuestError extends Error {}
  /** @type {import("./Sidebar.js").SidebarLinePreinit} */
  static sidebar = {
    preinit(sidebar) {
      const onquestupdate = sidebar.show.bind(sidebar)

      return function (player) {
        const status = Quest.active(player)
        if (!status) return false

        const listeners = status.quest.steps(player).updateListeners
        if (!listeners.has(onquestupdate)) listeners.add(onquestupdate)

        return `§6Квест: §f${status.quest.displayName}\n${status.step?.text()}\n§6Подробнее: §f.q`
      }
    },
  }

  /**
   * @type {Record<string, Quest>}
   */
  static instances = {}

  /**
   * @type {Record<string, PlayerQuest>}
   */
  players = {}

  /**
   * @param {Player} player
   */
  steps(player) {
    if (this.players[player.id]) return this.players[player.id]

    this.players[player.id] = new PlayerQuest(this, player)
    this.init(this.players[player.id], player)

    world.afterEvents.playerLeave.subscribe(({ playerId }) => delete this.players[playerId])

    return this.players[player.id]
  }

  /**
   * @param {object} options
   * @param {string} options.displayName
   * @param {string} options.name
   * @param {(q: PlayerQuest, p: Player) => void} init
   */
  constructor({ name, displayName }, init) {
    this.name = name
    this.displayName = displayName
    this.init = init
    Quest.instances[this.name] = this
    SM.afterEvents.worldLoad.subscribe(() => {
      system.delay(() => {
        world.getAllPlayers().forEach(setQuests)
      })
    })
  }

  /**
   * @param {Player} player
   */
  enter(player) {
    this.step(player, 0)
  }

  /**
   * @param {Player} player
   * @param {number} stepNum
   */
  step(player, stepNum, restore = false) {
    const data = player.database
    data.quest ??= {
      active: this.name,
    }
    data.quest.active = this.name

    if (!restore) delete data.quest.additional
    data.quest.step = stepNum

    const steps = this.steps(player)
    const step = steps.list[stepNum] ?? steps.list[0]
    if (!step) return false
    player.success(
      `§f${restore ? 'Квест: ' : ''}${step.text()}${step.description ? '\n' : ''}${
        step.description ? '§6' + step.description() : ''
      }`
    )
    step.cleanup = step.activate?.(!restore).cleanup
  }

  /**
   * @param {Player} player
   */
  exit(player) {
    const data = player.database
    if (data.quest && typeof data.quest.step !== 'undefined') {
      this.steps(player).list[data.quest?.step].cleanup?.()
      delete this.players[player.id]
    }

    data.quest = {
      active: '',
      completed: data.quest?.completed ?? [],
    }
  }

  /**
   * @param {Player} player
   */
  static active(player) {
    const data = player.database
    if (!data.quest || typeof data.quest.active === 'undefined') return false

    const quest = Quest.instances[data.quest.active]
    if (!quest || typeof data.quest.step === 'undefined') return false

    return {
      quest,
      stepNum: data.quest.step,
      step: quest.steps(player).list[data.quest.step],
    }
  }
}

/**
 * @param {Player} player
 */
function setQuests(player) {
  const status = Quest.active(player)
  if (!status) return

  status.quest.step(player, status.stepNum, true)
}

world.afterEvents.playerSpawn.subscribe(({ player }) => setQuests(player))

/**
 * @typedef {string | (() => string)} QuestText
 */

/**
 * @typedef {{
 *   text: QuestText,
 *   description?: QuestStepInput["text"]
 *   activate?(firstTime: boolean): { cleanup(): void }
 * }} QuestStepInput
 */

/**
 * @typedef {{
 *   next(): void
 *   cleanup?(): void
 *   player: Player
 *   quest: Quest
 *   text: () => string
 *   error(text: string): ReturnType<NonNullable<QuestStepInput['activate']>>
 *   description?: QuestStepThis['text']
 * } & Omit<QuestStepInput, 'text' | 'description'> & Pick<PlayerQuest, "quest" | "player" | "update">} QuestStepThis
 */

// TODO Move quest info getting somewhere
// TODO Test quest switching
// TODO Support multiple quest at the same time
// TODO Change quest status placement (also show steps/enters on the onScreenDisplay)

class PlayerQuest {
  /**
   * @param {Quest} parent
   * @param {Player} player
   */
  constructor(parent, player) {
    this.quest = parent
    this.player = player
  }

  /**
   * @type {(QuestStepThis)[]}
   */
  list = []

  /**
   * @type {Set<(p: Player) => void>}
   */
  updateListeners = new Set()
  update() {
    this.updateListeners.forEach(e => e(this.player))
  }

  /**
   * @param {QuestStepInput & ThisType<QuestStepThis>} options
   */
  dynamic(options) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const step = this
    const text = options.text
    const description = options.description
    const i = this.list.length
    /** @type {PlayerQuest["list"][number]} */
    const ctx = {
      ...options,
      text: typeof text === 'string' ? () => text : text,
      description: typeof description === 'string' ? () => description : description,

      player: this.player,
      update: this.update.bind(this),
      quest: this.quest,
      next() {
        this.cleanup?.()
        if (step.list[i + 1]) {
          this.quest.step(this.player, i + 1)
        } else {
          this.quest.exit(this.player)
          step._end()
          delete this.quest.players[this.player.id]
        }
        this.update()
        step.updateListeners.clear()
      },
      error(text) {
        this.player.fail('§cУпс, квест сломался: ' + text)
        return { cleanup() {} }
      },
    }

    // Share properties between mixed objects
    Object.setPrototypeOf(options, ctx)
    this.list.push(ctx)
    return ctx
  }

  /**
   *
   * @param {(this: QuestStepThis) => void} action
   */
  start(action) {
    this.dynamic({
      text: '',
      activate() {
        action.call(this)
        this.next()
        return { cleanup() {} }
      },
    })
  }

  /**
   * @param {Vector3} from
   * @param {Vector3} to
   * @param {QuestText} text
   * @param {QuestText} [description]
   */
  place(from, to, text, description, doNotAllowBuilders = true) {
    this.dynamic({
      text,
      description,
      activate() {
        /** @type {ReturnType<typeof PlaceAction.onEnter>[]} */
        const actions = []
        for (const pos of Vector.foreach(from, to)) {
          actions.push(
            PlaceAction.onEnter(pos, player => {
              if (player.id !== this.player.id) return
              if (doNotAllowBuilders && isBuilding(player)) return

              this.next()
            })
          )
        }

        const { x, y, z } = Vector.lerp(from, to, 0.5)
        const temp = this.quest.steps(this.player).createTargetCompassInterval({ place: { x, y, z } })

        return {
          cleanup() {
            temp.cleanup()
            actions.forEach(a => a.unsubscribe())
          },
        }
      },
    })
  }

  /**
   * @typedef {{
   *   text(value: number): string,
   *   description?: QuestCounterInput['text']
   *   end: number,
   *   value?: number,
   * } & Omit<QuestStepInput, "text" | "description">
   * } QuestCounterInput
   */

  /**
   * @typedef {QuestStepThis &
   * { diff(this: QuestStepThis, m: number): void } &
   *   Omit<QuestCounterInput, 'text' | 'description'>
   * } QuestCounterThis
   */

  /**
   * @param {QuestCounterInput & Partial<QuestCounterThis> & ThisType<QuestCounterThis>} options
   */
  counter(options) {
    options.value ??= 0

    options.diff = function (diff) {
      options.value ??= 0
      const result = options.value + diff

      if (result < options.end) {
        // Saving value to db
        const data = this.player.database
        if (data.quest) data.quest.additional = result

        // Updating interface
        options.value = result
        this.update()
      } else {
        this.next()
      }
    }

    const inputedActivate = options.activate?.bind(options)
    options.activate = function (firstTime) {
      if (!this.player) throw new ReferenceError('Quest::this.player is undefined!')
      const data = this.player.database
      if (typeof data.quest?.additional === 'number') options.value = data.quest?.additional

      options.value ??= 0

      return inputedActivate?.(firstTime) ?? { cleanup() {} }
    }
    const inputedText = options.text.bind(options)
    options.text = () => inputedText(options.value)

    if (options.description) {
      const inputedDescription = options.description.bind(options)
      options.description = () => inputedDescription(options.value)
    }

    this.dynamic(options)
  }

  /**
   * @typedef {{
   *   npcEntity: Entity
   *   placeText?: QuestStepInput["text"]
   *   placeDescription?: QuestStepInput["text"]
   *   talkText: QuestStepInput["text"]
   *   talkDescription?: QuestStepInput["text"]
   * } & QuestStepInput} QuestDialogueInput
   */

  /**
   * @typedef {QuestStepThis & QuestDialogueInput} QuestDialogueThis
   */

  /**
   * @param {QuestDialogueInput & Partial<QuestDialogueThis> & ThisType<QuestDialogueThis>} options
   */
  dialogue(options) {
    if (!options.npcEntity.isValid()) return this.failed('Неигровой персонаж недоступен')
    const location = options.npcEntity.location

    options.placeText ??= () => 'Доберитесь до ' + options.npcEntity.nameTag

    this.place(
      Vector.add(location, Vector.multiply(Vector.one, -1)),
      Vector.add(location, Vector.one),
      options.placeText,
      options.placeDescription
    )
    this.dynamic({
      text: options.talkText,
      description: options.talkDescription,
      activate() {
        return new Temporary(({ system }) => {
          system.afterEvents.scriptEventReceive.subscribe(
            event => {
              if (event.id !== 'quest:dialogue.end' || !event.initiator) return
              if (event.initiator.id !== this.player.id) return
              this.next()
            },
            {
              namespaces: ['quest'],
            }
          )
        })
      },
    })
  }

  /**
   * @typedef {{
   *   text?: (AirdropPos: string) => string
   * } & ({
   *   spawnAirdrop: (key: string | undefined) => Airdrop
   * } | { lootTable: LootTable } & ({ location: Vector3 } | { abovePlayerY?: number })
   * )} QuestAirdropInput
   */

  /**
   * @typedef {Partial<QuestStepThis> & QuestAirdropInput} QuestAirdropThis
   */

  /**
   * @param {QuestAirdropInput & ThisType<QuestAirdropThis>} options
   */
  airdrop(options) {
    const spawnAirdrop =
      'spawnAirdrop' in options
        ? options.spawnAirdrop
        : (/** @type {string | undefined} */ key) =>
            new Airdrop(
              {
                position:
                  'location' in options
                    ? options.location
                    : Vector.add(this.player.location, {
                        x: 0,
                        y: options.abovePlayerY ?? 50,
                        z: 0,
                      }),
                loot: options.lootTable,
                for: this.player.id,
              },
              key
            )

    let airdroppos = ''
    this.dynamic({
      text: () => (options.text ? options.text(airdroppos) : '§6Забери аирдроп' + airdroppos),
      activate() {
        // Saving/restoring airdrop
        const db = this.player.database
        if (!db.quest) return this.error('База данных квестов недоступна')

        /** @type {Airdrop} */
        let airdrop
        const key = db.quest.additional

        if (typeof key === 'string') {
          if (key in Airdrop.db) {
            airdrop = spawnAirdrop(key)
          } else {
            console.error(
              new Quest.error(`No airdrop found, player '${this.player.name}§r', quest: ${this.quest.name}`)
            )
            system.delay(() => this.next())
            return { cleanup() {} }
          }
        } else {
          airdrop = spawnAirdrop()
        }

        db.quest.additional = airdrop.key
        if (!key && !airdrop.chestMinecart) return this.error('Не удалось вызвать аирдроп')

        const temporary = new Temporary(({ world }) => {
          world.afterEvents.playerInteractWithEntity.subscribe(event => {
            const airdropEntity = airdrop.chestMinecart
            if (!airdropEntity) return
            if (event.target.id !== airdropEntity.id) return

            if (this.player.id === event.player.id) {
              system.delay(() => this.next())
            }
          })

          world.afterEvents.entityDie.subscribe(event => {
            if (event.deadEntity.id !== airdrop.chestMinecart?.id) return

            system.delay(() => this.next())
          })
        })

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const qthis = this
        let i = 0
        this.quest.steps(this.player).createTargetCompassInterval({
          place: Vector.floor(this.player.location),
          interval() {
            const airdropEntity = airdrop.chestMinecart
            if (!airdropEntity || !airdropEntity.isValid()) return

            this.place = Vector.floor(airdropEntity.location)

            if (i === 1) {
              i = 0
              airdrop.showParticleTrace(this.place)
            } else {
              i++
            }

            airdroppos = ` на\n§f${Vector.string(this.place, true)}`
            qthis.update()
          },
          temporary,
        })

        return temporary
      },
    })
  }

  /**
   * @param {string} reason
   */
  failed(reason) {
    this.dynamic({
      activate: () => {
        this.player.fail(reason)
        this.quest.exit(this.player)
        return { cleanup() {} }
      },
      text: () => '§cКвест сломался: ' + reason,
    })
  }

  /** @private */
  _end = () => {}

  /**
   * @param {(this: PlayerQuest) => void} action
   */
  end(action) {
    this._end = action
  }

  /**
   * @typedef {{
   *   place: Vector3
   *   temporary?: Temporary
   *   interval?: VoidFunction & ThisParameterType<CompassOptions>
   * }} CompassOptions
   */

  /**
   * @param {CompassOptions} options
   */
  createTargetCompassInterval(options) {
    const temp = new Temporary(({ system }) => {
      system.runInterval(
        () => {
          if (!this.player.isValid()) return temp.cleanup()
          if (
            !options.place ||
            typeof options.place.x !== 'number' ||
            typeof options.place.y !== 'number' ||
            typeof options.place.z !== 'number'
          )
            return

          options.interval?.()

          // TODO Cleanup
          Compass.setFor(this.player, options.place)
        },
        'Quest place marker particle',
        20
      )
    }, options.temporary)
    return temp
  }
}
