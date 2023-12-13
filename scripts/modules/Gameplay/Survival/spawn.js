import { ItemStack, Player, Vector, system, world } from '@minecraft/server'
import {
  MinecraftBlockTypes,
  MinecraftEffectTypes,
  MinecraftItemTypes,
} from '@minecraft/vanilla-data.js'
import { isBuilding } from 'modules/Gameplay/Build/list.js'
import { EditableLocation, InventoryStore } from 'smapi.js'
import { Portal } from '../../../lib/Class/Portals.js'
import { RadiusRegion, Region } from '../../Region/Region.js'
import { MENU } from '../../Server/menuItem.js'
import { ANARCHY } from './anarchy.js'

export const SPAWN = {
  startAxeItem: new ItemStack(MinecraftItemTypes.WoodenAxe).setInfo(
    'Начальный топор',
    'Начальный топор'
  ),
  /** @type {string[]} */
  startAxeCanBreak: Object.entries(MinecraftBlockTypes)
    .filter(e => e[0].match(/log/i))
    .map(e => e[1]),
  inventory: {
    xp: 0,
    health: 20,
    equipment: {},
    slots: { 0: MENU.item },
  },
  location: new EditableLocation('spawn', {
    fallback: new Vector(0, 200, 0),
  }),
  /** @type {undefined | Region} */
  region: void 0,
  /** @type {undefined | Portal} */
  portal: void 0,
}
SPAWN.startAxeItem.setCanDestroy(SPAWN.startAxeCanBreak)
SPAWN.startAxeItem.nameTag = 'Начальный топор'
SPAWN.startAxeItem.setLore(['§r§7Начальный топор'])
/**
 *
 * @param {Player} player
 */
function spawnInventory(player) {
  if (isBuilding(player)) return
  const data = player.database.survival

  if (data.inv === 'anarchy') {
    ANARCHY.inventory.saveFromEntity(player, {
      rewrite: false,
      keepInventory: false,
    })
    data.anarchy = Vector.floor(player.location)
  }

  if (data.inv !== 'spawn') {
    InventoryStore.load({ to: player, from: SPAWN.inventory })
    data.inv = 'spawn'
  }
}

if (SPAWN.location.valid) {
  world.setDefaultSpawnLocation(SPAWN.location)
  SPAWN.portal = new Portal('spawn', null, null, player => {
    if (!Portal.canTeleport(player)) return
    spawnInventory(player)

    player.teleport(SPAWN.location)
  })
  world.setDefaultSpawnLocation(SPAWN.location)
  SPAWN.region = Region.locationInRegion(SPAWN.location, 'overworld')
  if (!SPAWN.region || !(SPAWN.region instanceof RadiusRegion)) {
    SPAWN.region = new RadiusRegion(
      { x: SPAWN.location.x, z: SPAWN.location.z, y: SPAWN.location.y },
      200,
      'overworld',
      {
        doorsAndSwitches: false,
        openContainers: false,
        pvp: false,
        allowedEntities: 'all',
        owners: [],
      }
    )
  }
  system.runPlayerInterval(
    player => {
      if (SPAWN.region && SPAWN.region.vectorInRegion(player.location)) {
        spawnInventory(player)

        player.addEffect(MinecraftEffectTypes.Saturation, 1, {
          amplifier: 255,
          showParticles: false,
        })
      }
    },
    'SpawnRegion',
    20
  )
}
