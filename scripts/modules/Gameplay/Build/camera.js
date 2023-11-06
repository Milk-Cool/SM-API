import { EasingType, Player, Vector, system, world } from '@minecraft/server'
import { ActionForm, ModalForm, util } from 'xapi.js'
import {
  getChatAugments,
  parseLocationAugs,
} from '../../../lib/Command/utils.js'

/**
 * @typedef {"spinAroundPos"} CameraDBModes
 *
 * @typedef {{
 *   camera?: {
 *     pos: Vector3;
 *     type: string;
 *     ease: EasingType;
 *     easeTime: number;
 *     facing: string | Vector3
 *     mode: CameraDBModes
 *     spinRadius: number
 *     modeStep?: number
 *   }
 * }} CameraDB
 */

const CAMERA = {
  TYPES: ['minecraft:free'],
  /** @type {EasingType[]} */
  EASE: [EasingType.Linear],
  /**
   * @type {Record<CameraDBModes, string>}
   */
  MODES: {
    spinAroundPos: 'Крутится вокруг позиции',
  },
}

/**
 * @param {Player} player
 * @param {Player} target
 */
function setupCameraForm(player, target) {
  /** @type {PlayerDB<CameraDB>} */
  const { data, save } = target.db()

  new ModalForm('§3Настройки камеры §f' + target.name)
    .addDropdownFromObject(
      'Тип',
      Object.fromEntries(CAMERA.TYPES.map(e => [e, e]))
    )
    .addDropdownFromObject('Переход', EasingType, {
      defaultValue: EasingType.Linear,
    })
    .addSlider('Длительность движения в секундах', 0, 100, 1, 1)
    .addTextField('Координаты центральной позиция (~ разрешены)', '0 ~1 0')
    .addTextField(
      'Позиция куда камера будет повернута (либо игрок в меню ниже)',
      '0 ~1 0'
    )
    .addDropdownFromObject(
      'Игрок к которому камера будет повернута (либо позиция в меню выше)',
      Object.fromEntries(world.getAllPlayers().map(e => [e.name, e.name])),
      { none: true }
    )
    .addDropdownFromObject('Режим камеры', CAMERA.MODES)
    .addSlider('Радиус при прокрутке вокруг позиции', 0, 100)
    .show(
      target,
      (
        ctx,
        type,
        ease,
        easeTime,
        rawPos,
        facingPosRaw,
        facingPlayer,
        mode,
        spinRadius
      ) => {
        const rawPosArray = getChatAugments(rawPos, '')
        const pos = parseLocationAugs(
          [rawPosArray[0], rawPosArray[1], rawPosArray[2]],
          player
        )

        if (!pos)
          return ctx.error(
            'Неправильныe координаты центральной позиции камеры: ' +
              util.inspect(rawPosArray)
          )

        let facing
        if (facingPosRaw) {
          const rawPosArray = getChatAugments(facingPosRaw, '')
          facing = parseLocationAugs(
            [rawPosArray[0], rawPosArray[1], rawPosArray[2]],
            player
          )
        } else if (
          facingPlayer &&
          facingPlayer !== ModalForm.arrayDefaultNone
        ) {
          facing = facingPlayer
        }

        if (!facing)
          return ctx.error('Не указана ни одна позиция для наблюдения камерой')

        if (!mode)
          return ctx.error('Неизвестный режим камеры ' + util.inspect(mode))

        data.camera = {
          type,
          ease: EasingType[ease],
          easeTime,
          pos,
          facing,
          mode,
          spinRadius,
        }

        save()
        createCameraInteval(target)
        player.tell('§3§l> §rСохранено!')
      }
    )
}

/**
 * @type {Record<string, number>}
 */
const intervales = {}

/**
 * @param {Player} player
 */
function createCameraInteval(player) {
  /** @type {PlayerDB<CameraDB>} */
  const { data } = player.db()

  if (!data.camera) return

  if (intervales[player.id]) system.clearRun(intervales[player.id])
  intervales[player.id] = system.runInterval(
    () => {
      /** @type {PlayerDB<CameraDB>} */
      const { data, save } = player.db()

      if (data.camera) {
        if (data.camera.mode === 'spinAroundPos') {
          data.camera.modeStep ??= 1

          const radius = data.camera.spinRadius
          let step = data.camera.modeStep + 1

          console.debug({ radius, step, data })
          if (step === 360) step = 1

          // Convert degree to radians
          const radians = (step * Math.PI) / 180

          // Calculate x and z coordinates using trigonometry
          const posTo = Vector.add(data.camera.pos, {
            y: 0,
            x: radius * Math.cos(radians),
            z: radius * Math.sin(radians),
          })

          data.camera.modeStep = step

          const command = `camera @s set ${data.camera.type} ease ${
            data.camera.easeTime
          } ${data.camera.ease} pos ${Vector.string(posTo)} facing ${
            typeof data.camera.facing === 'string'
              ? data.camera.facing
              : Vector.string(data.camera.facing)
          }`
          console.log(command)
          player.runCommand(command)
          player.camera.setCamera(data.camera.type, {
            easeOptions: {
              easeTime: data.camera.easeTime,
              easeType: data.camera.ease,
            },
          })

          save()
        }
      }
    },
    'camera',
    data.camera.easeTime * 20
  )
}

for (const player of world.getAllPlayers()) createCameraInteval(player)
world.afterEvents.playerSpawn.subscribe(({ player }) =>
  createCameraInteval(player)
)
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  if (playerId in intervales) {
    system.clearRun(intervales[playerId])
    Reflect.deleteProperty(intervales, playerId)
  }
})

const cmd = new XCommand({ name: 'camera', role: 'admin' })
cmd.executes(ctx => selectPlayerForm(ctx.sender))
cmd.literal({ name: 'reset' }).executes(ctx => {
  /** @type {PlayerDB<CameraDB>} */
  const { data, save } = ctx.sender.db()
  ctx.sender.runCommand(`camera @s set minecraft:first_person`)
  delete data.camera
  save()
})

/**
 * @param {Player} player
 */
function selectPlayerForm(player) {
  const form = new ActionForm('§3Выбери игрока')
  form.addButton('§3' + player.name, () => setupCameraForm(player, player))

  for (const target of world.getAllPlayers().filter(e => e.id !== player.id)) {
    form.addButton(target.name, () => setupCameraForm(player, target))
  }
  form.show(player)
}
