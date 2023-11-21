import {
  ContainerSlot,
  ItemStack,
  ItemTypes,
  Player,
  system,
  world,
} from '@minecraft/server'
import { OverTakes, util } from 'smapi.js'
import { WE_PLAYER_SETTINGS } from '../index.js'

/**
 * @typedef {(player: Player, slot: ContainerSlot, settings: ReturnType<typeof WE_PLAYER_SETTINGS>) => void} IntervalFunction
 */

/**
 * @template {Record<string, any> & {version: number}} [LoreFormat=any]
 */
export class WorldEditTool {
  /**
   * @type {WorldEditTool<any>[]}
   */
  static tools = []

  /**
   * @type {IntervalFunction[]}
   */
  static intervals = []

  /**
   * @param {Object} o
   * @param {string} o.name
   * @param {string} o.displayName
   * @param {string} o.itemStackId
   * @param {(slot: ContainerSlot, player: Player) => void} [o.editToolForm]
   * @param {LoreFormat} [o.loreFormat]
   * @param {IntervalFunction} [o.interval0]
   * @param {IntervalFunction} [o.interval10]
   * @param {IntervalFunction} [o.interval20]
   * @param {(player: Player, item: ItemStack) => void} [o.onUse]
   * @param {Partial<WorldEditTool<LoreFormat>> & ThisType<WorldEditTool<LoreFormat>>} [o.overrides]
   */
  constructor({
    name,
    displayName,
    itemStackId,
    editToolForm,
    loreFormat,
    interval0,
    interval10,
    interval20,
    onUse,
    overrides,
  }) {
    WorldEditTool.tools.push(this)
    this.name = name
    this.displayName = displayName
    this.itemId = itemStackId
    if (editToolForm) this.editToolForm = editToolForm
    this.loreFormat = loreFormat ?? { version: 0 }
    this.loreFormat.version ??= 0
    this.onUse = onUse
    this.interval0 = interval0
    this.interval10 = interval10
    this.interval20 = interval20
    if (overrides) OverTakes(this, overrides)

    this.command = new Command({
      name,
      description: `Создает${
        editToolForm ? ' или редактирует ' : ''
      }${displayName}`,
      role: 'builder',
      type: 'we',
    }).executes(ctx => {
      const slotOrError = this.getToolSlot(ctx.sender)

      if (typeof slotOrError === 'string') ctx.error(slotOrError)
      else if (this.editToolForm) this.editToolForm(slotOrError, ctx.sender)
    })
  }
  /**
   * @param {Player} player
   */
  getToolSlot(player) {
    const slot = player.mainhand()

    if (!slot.typeId) {
      const item = ItemTypes.get(this.itemId)
      if (!item)
        throw new TypeError(`ItemType '${this.itemId}' does not exists`)
      slot.setItem(new ItemStack(item))
      return slot
    } else if (slot.typeId === this.itemId) {
      return slot
    } else {
      return `Выбери пустой слот чтобы создать ${this.displayName} или возьми для настройки!`
    }
  }
  /**
   * @param {Player} player
   * @returns {string}
   */
  getMenuButtonNameColor(player) {
    const { typeId } = player.mainhand()
    const edit = typeId === this.itemId
    const air = !typeId
    return edit ? '§2' : air ? '' : '§8'
  }
  /**
   * @param {Player} player
   * @returns {string}
   */
  getMenuButtonName(player) {
    const { typeId } = player.mainhand()
    const edit = typeId === this.itemId

    if (!this.editToolForm && edit) return ''

    return `${this.getMenuButtonNameColor(player)}${
      edit ? 'Редактировать' : 'Создать'
    } ${this.displayName}`
  }
  /**
   * @param {string[]} lore
   * @returns {LoreFormat}
   */
  parseLore(lore) {
    let raw
    try {
      raw = JSON.parse(
        lore
          .slice(lore.findIndex(e => e.includes('\x01')) + 1)
          .join('')
          .replace(/§(.)/g, '$1')
      )
    } catch (e) {
      e
    }
    if (raw?.version !== this.loreFormat.version) {
      // @ts-expect-error yes
      return this.loreFormat
    }
    delete raw.version

    return raw
  }
  /** @type {Record<string, string>} */
  loreTranslation = {
    shape: 'Форма',
    size: 'Размер',
    height: 'Высота',
    maxDistance: 'Макс. расстояние',
    blocksSet: 'Набор блоков',
  }
  /**
   * @param {LoreFormat} format
   * @returns {string[]}
   */
  stringifyLore(format) {
    format.version ??= this.loreFormat.version
    return [
      ...Object.entries(format)
        .filter(([key]) => key !== 'version')
        .map(
          ([key, value]) =>
            `§r§f${this.loreTranslation[key] ?? key}: ${util.inspect(value)}`
        ),

      '\x01',

      ...(JSON.stringify(format)
        .split('')
        .map(e => '§' + e)
        .join('')
        .match(/.{0,50}/g) || []),
    ]
  }
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack: item }) => {
  if (!(player instanceof Player)) return
  const tool = WorldEditTool.tools.find(e => e.itemId === item.typeId)
  util.catch(() => tool?.onUse?.(player, item))
})

let ticks = 0
system.runInterval(
  () => {
    for (const player of world.getAllPlayers()) {
      const item = player.mainhand()
      const tool = WorldEditTool.tools.find(e => e.itemId === item.typeId)
      const settings = WE_PLAYER_SETTINGS(player)
      WorldEditTool.intervals.forEach(e => e(player, item, settings))
      if (!tool) continue
      /** @type {(undefined | IntervalFunction)[]} */
      const fn = [tool.interval0]
      if (ticks % 10 === 0) fn.push(tool.interval10)
      if (ticks % 20 === 0) fn.push(tool.interval20)

      fn.forEach(e => e?.(player, item, settings))
    }
    if (ticks >= 20) ticks = 0
    else ticks++
  },
  'we tool',
  0
)