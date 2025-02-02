import { BlockPermutation, LocationInUnloadedChunkError, Vector, system, world } from '@minecraft/server'
import { util } from 'lib.js'
import { DynamicPropertyDB } from 'lib/Database/Properties.js'

/**
 * @typedef {{
 *   typeId: string
 *   states?: Record<string, string | number | boolean>
 *   date: number
 *   location: Vector3
 * }} ScheduledBlockPlace
 */

export const SHEDULED_DB = new DynamicPropertyDB('ScheduledBlockPlace', {
  /** @type {Record<Dimensions, ScheduledBlockPlace[]>} */
  type: {
    end: [],
    nether: [],
    overworld: [],
  },
  defaultValue: () => [],
}).proxy()

/**
 * @param {Omit<ScheduledBlockPlace, 'date'> & {
 *   dimension: Dimensions
 *   restoreTime: number
 * }} options
 */
export function scheduleBlockPlace({ dimension, restoreTime, ...options }) {
  const other = SHEDULED_DB[dimension].find(e => Vector.string(e.location) === Vector.string(options.location))
  if (!other) SHEDULED_DB[dimension].push({ date: Date.now() + restoreTime, ...options })
}

// If we will not use immutable unproxied value,
// proxy wrapper will convert all values into subproxies
// which is too expensive when arrays are very big
const IMMUTABLE_DB = DynamicPropertyDB.immutableUnproxy(SHEDULED_DB)

/** @type {['overworld', 'nether', 'end']} */
const DIMENSIONS = ['overworld', 'nether', 'end']

system.runInterval(
  function scheduledBlockPlaceInterval() {
    for (const dimension of DIMENSIONS) {
      const schedules = IMMUTABLE_DB[dimension]
      if (!Array.isArray(schedules) || !schedules.length) continue

      const time = util.benchmark('dimension', 'sc')
      for (const schedule of schedules) {
        if (!schedule) continue

        if (Date.now() < schedule.date) continue

        // To prevent blocks from restoring randomly in air
        // we calculate if there is near broken block and swap
        // their restore date, so they will restore in reversed order
        const nearBlock = schedules.find(
          e => e !== schedule && Vector.distance(e.location, schedule.location) <= 1 && e.date > schedule.date,
        )
        if (nearBlock) continue

        try {
          const block = world.overworld.getBlock(schedule.location)
          if (!block?.isValid()) continue

          block?.setPermutation(BlockPermutation.resolve(schedule.typeId, schedule.states))
          console.debug('schedule place', schedule.typeId, schedule.location)
        } catch (e) {
          if (e instanceof LocationInUnloadedChunkError) continue
          util.error(e)
        }

        // Remove successfully placed block from the schedule array
        SHEDULED_DB[dimension] = schedules.filter(e => e !== schedule)
      }
      time()
    }
  },
  'scheduled block place',
  10,
)
