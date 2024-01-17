import { Entity, PlayerInteractWithEntityBeforeEvent, system, world } from '@minecraft/server'
import { MinecraftEntityTypes } from '@minecraft/vanilla-data.js'
import { util } from 'lib/util.js'
import { chunkIsUnloaded } from 'smapi.js'
import { EditableLocation } from './EditableLocation.js'

class EditableNpc {
  static type = MinecraftEntityTypes.Npc
  static propertyName = 'type'
  /**
   * @param {Pick<PlayerInteractWithEntityBeforeEvent, 'target' | 'player'>} event
   */
  static onInteract(event) {
    const npc = EditableNpc.npcs.find(e => e.entity?.id === event.target.id)
    if (!npc) return event.player.tell(`§f${event.target.nameTag}: §cЯ не могу с вами говорить. Приходите позже.`)
  }

  /**
   * @type {EditableNpc[]}
   */
  static npcs = []
  /**
   * @type {Entity | undefined}
   */
  entity

  /**
   * Creates new dynamically loadable npc
   * @param {object} o - Options
   * @param {string} o.name - Type name of the npc. Used to restore npc pointer after script reload
   * @param {VoidFunction} o.onInteract - Function that gets called on interact
   * @param {Dimensions} o.dimensionId - Dimension id
   * @param {string} o.displayName - NameTag of the npc
   * @param {number} o.skinVariant - Skin variant (Номер скина нпс в редактировании, начинается с 0)
   */
  constructor({ name, onInteract, dimensionId = 'overworld', displayName, skinVariant }) {
    this.location = new EditableLocation(name + ' NPC')
    this.name = name
    this.onInteract = onInteract
    this.dimensionId = dimensionId
    this.displayName = displayName
    this.skinVariant = skinVariant
    EditableNpc.npcs.push(this)
  }

  spawn() {
    if (!this.location.valid) {
      throw new TypeError(`§cNpc(§r${this.name}§r§c): Location is not valid, spawn is impossible. Set location first`)
    }

    this.entity = world[this.dimensionId].spawnEntity(EditableNpc.type, this.location)
    this.entity.nameTag = this.displayName
    const variant = this.entity.getComponent('variant')
    if (variant) {
      // TODO Test how to set skin
      variant.value = this.skinVariant
    }
  }
}

world.beforeEvents.playerInteractWithEntity.subscribe(event => {
  if (event.target.typeId !== MinecraftEntityTypes.Npc) return

  event.cancel = true
  system.run(() => {
    try {
      EditableNpc.onInteract(event)
    } catch (e) {
      event.player.tell('§cНе удалось открыть диалог. Сообщите об этом администрации.')
      util.error(e)
    }
  })
})

system.runInterval(
  () => {
    /**
     * Store entities from each dimension so we are not grabbing them much
     * @type {Partial<Record<Dimensions, { npc: any, entity: Entity }[]>>}
     */
    const cache = {}

    EditableNpc.npcs.forEach(npc => {
      if (npc.entity) return // Entity already loaded

      const location = npc.location
      if (!location.valid) return
      if (chunkIsUnloaded({ dimensionId: npc.dimensionId, location })) return

      const npcs = (cache[npc.dimensionId] ??= world[npc.dimensionId]
        .getEntities({
          type: EditableNpc.type,
        })
        .map(e => ({
          entity: e,
          npc: e.getDynamicProperty(EditableNpc.propertyName),
        })))

      const filteredNpcs = npcs.filter(e => e.npc === npc.name)
      if (filteredNpcs.length > 1) {
        // More then one? Save only first one, kill others
        npc.entity = filteredNpcs.shift()?.entity
        filteredNpcs.forEach(e => e.entity.remove())
      } else {
        //
        npc.entity = filteredNpcs[0]?.entity
      }

      // Cannot find, spawn
      if (!npc.entity) npc.spawn()
    })
  },
  'npc loading',
  20
)
