import { ItemStack, Vector, system } from '@minecraft/server'
import { MinecraftItemTypes } from '@minecraft/vanilla-data.js'
import { SOUNDS } from 'config.js'
import { Join } from 'modules/PlayerJoin/playerJoin.js'
import { AXE } from 'modules/Survival/Features/axe.js'
import { randomTeleport } from 'modules/Survival/Features/randomTeleport.js'
import { Anarchy } from 'modules/Survival/Place/Anarchy.js'
import { Spawn } from 'modules/Survival/Place/Spawn.js'
import { createPublicGiveItemCommand } from 'modules/Survival/utils/createPublicGiveItemCommand.js'
import { EditableLocation, Quest, SafeAreaRegion, Temporary } from 'smapi.js'
import { LEARNING_L } from './lootTables.js'

export const LEARNING = {
  QUEST: new Quest({ displayName: 'Обучение', name: 'learning' }, q => {
    if (!Anarchy.portal || !Anarchy.portal.from || !Anarchy.portal.to || !LEARNING.RTP_LOCATION.valid)
      return q.failed('§cСервер не настроен')

    q.start(function () {
      this.player.info('§6Обучение!')
    })

    q.place(Anarchy.portal.from, Anarchy.portal.to, '§6Зайди в портал анархии')

    q.counter({
      end: 5,
      text(value) {
        return `§6Наруби §f${value}/${this.end} §6блоков дерева`
      },
      activate(firstTime) {
        if (firstTime) {
          // Delay code by one tick to prevent giving item
          // in spawn inventory that will be replaced with
          // anarchy
          system.delay(() => {
            this.player.container?.addItem(LEARNING.START_AXE)
          })
        }

        return new Temporary(({ world }) => {
          world.afterEvents.playerBreakBlock.subscribe(({ player, brokenBlockPermutation }) => {
            if (player.id !== this.player.id) return
            if (!AXE.BREAKS.includes(brokenBlockPermutation.type.id)) return

            this.player.playSound(SOUNDS.action)
            this.diff(1)
          })
        })
      },
    })

    q.airdrop({
      lootTable: LEARNING_L,
    })

    q.end(function () {
      this.player.success('§6Обучение закончено!')
    })
  }),
  LOOT_TABLE: LEARNING_L,
  RTP_LOCATION: new EditableLocation('learning_quest_rtp', { type: 'vector3+radius' }).safe,

  START_AXE: new ItemStack(MinecraftItemTypes.WoodenAxe).setInfo('§r§6Начальный топор', 'Начальный топор'),
  /** @type {SafeAreaRegion | undefined} */
  SAFE_AREA: void 0,
}

LEARNING.RTP_LOCATION.onLoad.subscribe(location => {
  LEARNING.SAFE_AREA = new SafeAreaRegion({
    permissions: { allowedEntities: 'all' },
    center: location,
    radius: location.radius,
    dimensionId: 'overworld',
  })

  AXE.ALLOW_BREAK_IN_REGIONS.push(LEARNING.SAFE_AREA)
})

Join.onMoveAfterJoin.subscribe(({ player, firstJoin }) => {
  if (firstJoin) LEARNING.QUEST.enter(player)
})

createPublicGiveItemCommand('startwand', LEARNING.START_AXE)

Anarchy.learningRTP = player => {
  if (!LEARNING.RTP_LOCATION.valid) {
    player.fail('Случайное перемещение не настроено')
    Spawn.portal?.teleport(player)
    delete player.database.survival.anarchy
    return
  }

  const location = LEARNING.RTP_LOCATION
  const radius = Math.floor(location.radius / 2)

  randomTeleport(
    player,
    Vector.add(location, { x: radius, y: 0, z: radius }),
    Vector.add(location, { x: -radius, y: 0, z: -radius }),
    {
      elytra: false,
      teleportCallback() {
        player.success('Вы были перемещены на случайную локацию.')
      },
      keepInSkyTime: 20,
    }
  )
}
