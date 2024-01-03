import { Player, Vector } from '@minecraft/server'
import { StoneQuarry } from 'modules/Survival/Place/StoneQuarry.js'
import { TechCity } from 'modules/Survival/Place/TechCity.js'
import { VillageOfExplorers } from 'modules/Survival/Place/VillafeOfExplorers.js'
import { VillageOfMiners } from 'modules/Survival/Place/VillageOfMiners.js'
import { DefaultPlaceWithSafeArea } from 'modules/Survival/utils/DefaultPlace.js'
import { ActionForm } from 'smapi.js'

new Command({
  name: 'tp',
  role: 'member', // TODO! on release change role to builder
  description: 'Открывает меню телепортации',
}).executes(ctx => {
  tpMenu(ctx.sender)
})

/**
 * @param {Player} player
 */
export function tpMenu(player) {
  const form = new ActionForm('Выберите локацию')

  const locations = {
    'Деревня шахтеров': location(VillageOfMiners, '136 71 13457 140 -10'),
    'Деревня исследователей': location(VillageOfExplorers, '-35 75 13661 0 20'),
    'Каменоломня': location(StoneQuarry, '-1300 76 14800 -90 5'),
    'Техноград': location(TechCity, '-1288 64 13626 90 -10'),
  }

  for (const [name, location] of Object.entries(locations)) {
    form.addButton(name, () => player.runCommand('tp ' + location))
  }

  return form.show(player)
}

/**
 *
 * @param {DefaultPlaceWithSafeArea} place
 * @param {string} fallback
 */
function location(place, fallback) {
  if (place.portalTeleportsTo.valid) {
    return Vector.string(place.portalTeleportsTo) + ' ' + place.portalTeleportsTo.xRot + place.portalTeleportsTo.yRot
  }

  return fallback
}
