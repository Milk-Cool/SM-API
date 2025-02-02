import { ItemStack } from '@minecraft/server'
import { CUSTOM_ITEMS } from 'config.js'
import { LootTable } from 'lib.js'

export const LEARNING_L = new LootTable(
  { id: 'starter' },
  {
    type: 'WoodenSword',
    chance: '100%',
    enchantments: {
      unbreaking: {
        '0...2': '40%',
        '3': '60%',
      },
    },
  },
  {
    type: 'LeatherBoots',
    chance: '80%',
  },
  {
    type: 'LeatherLeggings',
    chance: '100%',
    enchantments: {
      unbreaking: {
        '0...2': '50%',
        '3': '50%',
      },
    },
  },
  {
    type: 'LeatherChestplate',
    chance: '100%',
    enchantments: {
      unbreaking: {
        '0...2': '50%',
        '3': '50%',
      },
    },
  },
  {
    type: 'LeatherHelmet',
    chance: '80%',
  },
  {
    type: 'CookedBeef',
    chance: '100%',
    amount: {
      '10...30': '50%',
      '31...64': '10%',
    },
  },
  {
    typeId: CUSTOM_ITEMS.money,
    chance: '100%',
    amount: {
      '90...100': '1%',
    },
  },
)
