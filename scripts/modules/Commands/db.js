import { Player, world } from '@minecraft/server'
import { DynamicPropertyDB } from 'lib/Database/Properties.js'
import { ActionForm } from 'lib/Form/ActionForm.js'
import { ModalForm } from 'lib/Form/ModalForm.js'
import { TIMERS_PATHES, util } from 'smapi.js'

// TODO Show player nicknames below to ids in player db
const db = new Command({
  name: 'db',
  description: 'Просматривает базу данных',
  role: 'admin',
})

db.executes(ctx => selectTable(ctx.sender, true))

/**
 *
 * @param {Player} player
 * @param {true} [firstCall]
 */
function selectTable(player, firstCall) {
  const form = new ActionForm('Таблицы данных')
  for (const key in DynamicPropertyDB.keys) {
    const DB = DynamicPropertyDB.keys[key]
    const name = `${key} §7${Object.keys(DB.proxy()).length}§r`
    form.addButton(name, () => showTable(player, key))
  }
  form.show(player)
  if (firstCall) player.tell('§l§b> §r§3Закрой чат!')
}

/**
 *
 * @param {Player} player
 * @param {string} table
 */
function showTable(player, table) {
  /** @type {DynamicPropertyDB<string, any>} */
  const DB = DynamicPropertyDB.keys[table]
  const proxy = DB.proxy()

  const menu = new ActionForm(`${table}`)
  menu.addButton(ActionForm.backText, () => selectTable(player))
  menu.addButton('§3Новое значение§r', () => {
    const form = new ModalForm('§3+Значение в §f' + table).addTextField('Ключ', ' ')
    const { newform, callback } = changeValue(form, null)
    newform.show(player, (_, key, input, type) => {
      if (input)
        callback(input, type, newVal => {
          proxy[key] = newVal
        })
      showTable(player, table)
    })
  })
  menu.addButton('§3Посмотреть в §fRAW', () => {
    let raw = world.getDynamicProperty(DB.key)
    try {
      if (typeof raw === 'string') raw = JSON.parse(raw)
    } catch {}

    new ActionForm('§3RAW table §f' + table, util.inspect(raw))
      .addButton('Oк', () => {
        showTable(player, table)
      })
      .show(player)
  })

  /** @param {string} key */
  const propertyForm = key => {
    key = key + ''
    /** @type {any} */
    let value
    let failedToLoad = false

    try {
      value = proxy[key]
    } catch (e) {
      util.error(e)
      value = 'a'
      failedToLoad = true
    }

    const AForm = new ActionForm(
      '§3Ключ ' + key,
      `§7Тип: §f${typeof value}\n ${
        failedToLoad ? '\n§cОшибка при получении данных из таблицы!§r\n\n' : ''
      }\n${util.inspect(value)}\n `
    )

    AForm.addButton('Изменить', null, () => {
      const { newform, callback: ncallback } = changeValue(new ModalForm(key), value)

      newform.show(player, (_, input, inputType) => {
        if (input)
          ncallback(input, inputType, newValue => {
            proxy[key] = newValue
            player.tell(util.inspect(value) + '§r -> ' + util.inspect(newValue))
          })

        propertyForm(key)
      })
    })

    AForm.addButton('§cУдалить§r', () => {
      delete proxy[key]
      showTable(player, table)
    })
    AForm.addButton(ActionForm.backText, () => showTable(player, table))

    AForm.show(player)
  }

  const keys = Object.keys(proxy)
  for (const key of keys) {
    menu.addButton(key, () => propertyForm(key))
  }

  menu.show(player)
}

/**
 *
 * @param {ModalForm<(args_0: any, args_1: string) => void>} form
 * @param {*} value
 */
function changeValue(form, value) {
  let type = typeof value
  const typeDropdown = ['string', 'number', 'boolean', 'object']
  if (value) typeDropdown.unshift('Оставить прежний §7(' + type + ')')
  const stringifiedValue = value ? (typeof value === 'object' ? JSON.stringify(value) : value + '') : ''
  const newform = form
    .addTextField('Значение', 'оставь пустым для отмены', stringifiedValue)
    .addDropdown('Тип', typeDropdown)

  return {
    newform,
    callback: (
      /** @type {*} */ input,
      /** @type {string} */ inputType,
      /** @type {(newValue: any) => void} */ onChange
    ) => {
      let newValue = input

      if (
        !inputType.includes(type) &&
        (inputType === 'string' || inputType === 'object' || inputType === 'boolean' || inputType === 'number')
      ) {
        type = inputType
      }
      switch (type) {
        case 'number':
          newValue = Number(input)
          break

        case 'boolean':
          newValue = input === 'true'
          break

        case 'object':
          try {
            newValue = JSON.parse(input)
          } catch (e) {
            world.say('§4DB §cJSON.parse error: ' + e.message)
            return
          }

          break
      }
      onChange(newValue)
    },
  }
}

/**
 * It takes the benchmark results and sorts them by average time, then it prints them out in a nice
 * format
 * @returns A string.
 */
export function stringifyBenchmarkReult({ type = 'test', timerPathes = false } = {}) {
  let output = ''
  let res = []
  for (const [key, val] of Object.entries(util.benchmark.results[type])) {
    const totalCount = val.length
    const totalTime = val.reduce((p, c) => p + c)
    const average = totalTime / totalCount

    res.push({ key, totalCount, totalTime, average })
  }

  res = res.sort((a, b) => a.average - b.average)

  for (const { key, totalCount, totalTime, average } of res) {
    const color = colors.find(e => e[0] > average)?.[1] ?? '§4'
    const isPath = timerPathes && key in TIMERS_PATHES

    output += `§3Label §f${key}§r\n`
    output += `§3| §7average: ${color}${average.toFixed(2)}ms\n`
    output += `§3| §7total time: §f${totalTime}ms\n`
    output += `§3| §7call count: §f${totalCount}\n`
    if (isPath) output += `§3| §7path: §f${getPath(key)}\n`
    output += '\n\n'
  }
  return output
}

/** @type {[number, string][]} */
const colors = [
  [0.1, '§a'],
  [0.3, '§2'],
  [0.5, '§g'],
  [0.65, '§6'],
  [0.8, '§c'],
]

/**
 *
 * @param {string} key
 */
function getPath(key) {
  return `\n${TIMERS_PATHES[key]}`.replace(/\n/g, '\n§3| §r')
}

new Command({
  name: 'benchmark',
  description: 'Показывает время работы серверных систем',
  role: 'admin',
})
  .string('type', true)
  .boolean('pathes', true)
  .executes((ctx, type, pathes) => {
    if (type && !(type in util.benchmark.results))
      return ctx.error(
        'Неизвестный тип бенчмарка! Доступные типы: \n  §f' + Object.keys(util.benchmark.results).join('\n  ')
      )

    function show() {
      new ActionForm(
        'Benchmark',
        stringifyBenchmarkReult({
          type: type ?? 'timers',
          timerPathes: pathes ?? false,
        })
      )
        .addButton('Refresh', null, show)
        .addButton('Exit', null, () => void 0)
        .show(ctx.sender)
    }
    show()
  })
