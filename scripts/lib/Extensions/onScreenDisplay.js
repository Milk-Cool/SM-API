import { Player, ScreenDisplay, TicksPerSecond, system, world } from '@minecraft/server'
import { SCREEN_DISPLAY } from 'lib/Extensions/player.js'
import { util } from 'lib/util.js'

const $sidebar = '§t§i§psidebar'
const $title = 'title'
const $tipPrefix = '§t§i§p'

/** @typedef {'title' | 'sidebar' | `tip${1 | 2 | 3 | 4 | 5}`} TitleType */

/**
 * @type {Record<
 *   string,
 *   {
 *     actions: ((p: Player) => void)[]
 *     title?: {
 *       expires?: number
 *       subtitle?: McText
 *     }
 *   } & {
 *     [K in TitleType]?:
 *       | {
 *           value: McText
 *           priority: number
 *         }
 *       | undefined
 *   }
 * >}
 */
const TITLES = {}

/**
 * @type {Omit<(typeof ScreenDisplay)['prototype'], 'player'> &
 *   ThisType<{ player: Player & { [SCREEN_DISPLAY]: ScreenDisplay } } & Omit<ScreenDisplay, 'player'>>}
 */
export const SCREEN_DISPLAY_OVERRIDE = {
  isValid() {
    return this.player[SCREEN_DISPLAY].isValid()
  },
  setHudTitle(message, options, prefix = $title, n = 0) {
    const PLAYER_SD = (TITLES[this.player.id] ??= { actions: [] })

    /** @type {TitleType} */
    let SD_TYPE = 'title'

    if (prefix === $tipPrefix) {
      if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) {
        SD_TYPE = `tip${n}`
      }
    } else if (prefix === $sidebar) {
      SD_TYPE = 'sidebar'
    }

    const SD = (PLAYER_SD[SD_TYPE] ??= {
      value: '',
      priority: 0,
    })

    const priority = options?.priority ?? 0
    if (SD.priority > priority) return
    else SD.priority = priority

    if (options && SD_TYPE === 'title') {
      const totalTicks = options.fadeInDuration + options.fadeOutDuration + options.stayDuration
      if (totalTicks !== -1) {
        SD.expires = Date.now() + totalTicks * TicksPerSecond
      } else options.stayDuration = 0
    }

    // Do not update same text
    if (SD.value === message) {
      if (SD_TYPE === 'title') {
        if (SD.subtitle === options?.subtitle) return
      } else return
    }

    PLAYER_SD.actions.push(player => {
      if (!player.isValid()) return

      try {
        const title = `${prefix === $tipPrefix ? prefix + n : prefix}${message}`
        options ??= { ...defaultTitleOptions }
        // @ts-expect-error Supercall
        player[SCREEN_DISPLAY].setTitle(title, options)
      } catch (e) {
        util.error(e)
      }

      // Update references
      SD.value = message
      if (SD_TYPE === 'title') {
        SD.subtitle = options?.subtitle
      }
    })
  },
  setSidebar(text = '', priority) {
    this.setHudTitle(text, { priority, ...defaultOptions }, $sidebar)
  },
  setTip(n, text = '', priority) {
    this.setHudTitle(text, { priority, ...defaultOptions }, $tipPrefix, n)
  },
  setActionBar(text) {
    return this.player[SCREEN_DISPLAY].setActionBar(text)
  },
  updateSubtitle(subtitle) {
    return this.player[SCREEN_DISPLAY].updateSubtitle(subtitle)
  },
  setTitle(title, options) {
    return this.player[SCREEN_DISPLAY].setTitle(title, options)
  },
}

const defaultOptions = { fadeInDuration: 0, fadeOutDuration: 0, stayDuration: 0 }
const defaultTitleOptions = { ...defaultOptions, stayDuration: -1 }

system.run(() => {
  system.runInterval(
    () => {
      const players = world.getAllPlayers()
      for (const [id, data] of Object.entries(TITLES)) {
        const player = players.find(e => e.id === id)
        if (data.title?.expires && data.title.expires < Date.now()) {
          player?.onScreenDisplay.setHudTitle('', {
            ...defaultTitleOptions,
            priority: data.title.priority ?? 0,
          })
          delete TITLES[id]
        }

        if (player) {
          // Take first action and execute it
          data.actions.shift()?.(player)
        }
      }
    },
    'title set',
    1,
  )
})
