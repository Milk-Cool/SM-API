import {
	BlockBreakAfterEvent,
	EntitySpawnAfterEvent,
	MinecraftBlockTypes,
	Player,
	system,
	world,
} from "@minecraft/server";
import { GameUtils, XEntity } from "xapi.js";
import { Region, forEachItemAt } from "./Region.js";
import { BLOCK_CONTAINERS, DOORS_SWITCHES } from "./config.js";

let LOADED = false;

/**
 * @callback interactionAllowed
 * @param {Player} player
 * @param {Region} [region]
 * @param {{type: "break", event: BlockBreakAfterEvent} | {type: "place"} | {type: "useOn"}} context
 */

/**
 * @callback regionCallback
 * @param {Player} player
 * @param {Region} [region]
 */

/**
 * @callback spawnAllowed
 * @param {Region} [region]
 * @param {EntitySpawnAfterEvent} data
 */

/**
 * Loads regions with specified guards.
 * WARNING! Loads only one time
 * @param {interactionAllowed} allowed
 * @param {spawnAllowed} spawnAllowed
 * @param {regionCallback} regionCallback
 */
export function loadRegionsWithGuards(
	allowed,
	spawnAllowed,
	regionCallback = () => void 0
) {
	if (LOADED) throw new ReferenceError("Regions already loaded!");
	LOADED = true;

	/**
	 * Permissions for region
	 */
	world.beforeEvents.itemUseOn.subscribe((data) => {
		if (!(data.source instanceof Player)) return;
		const region = Region.locationInRegion(
			data.block,
			data.source.dimension.type
		);
		if (allowed(data.source, region, { type: "useOn" })) return;

		if (
			DOORS_SWITCHES.includes(data.block.typeId) &&
			region?.permissions?.doorsAndSwitches
		)
			return;

		if (
			BLOCK_CONTAINERS.includes(data.block.typeId) &&
			region?.permissions?.openContainers
		)
			return;

		data.cancel = true;
	});

	/**
	 * Permissions for region
	 */
	world.afterEvents.blockPlace.subscribe((data) => {
		const region = Region.locationInRegion(
			data.block.location,
			data.player.dimension.type
		);
		if (allowed(data.player, region, { type: "place" })) return;

		data.block.setType(MinecraftBlockTypes.air);
	});

	/**
	 * Permissions for region
	 */
	world.afterEvents.blockBreak.subscribe(
		({ player, block, brokenBlockPermutation, dimension }) => {
			const region = Region.locationInRegion(
				block.location,
				player.dimension.type
			);

			if (
				allowed(player, region, {
					type: "break",
					event: { player, block, brokenBlockPermutation, dimension },
				})
			)
				return;

			// setting block back
			block.setPermutation(brokenBlockPermutation);
			if (BLOCK_CONTAINERS.includes(brokenBlockPermutation.type.id)) {
				// setting chest inventory back
				const { container } = block.getComponent("inventory");
				forEachItemAt(dimension, block.location, (e) => {
					container.addItem(e.getComponent("item").itemStack);
					e.kill();
				});
			} else forEachItemAt(dimension, block.location);
		}
	);

	world.afterEvents.entitySpawn.subscribe(({ entity }) => {
		const typeId = GameUtils.safeGetTypeID(entity);
		if (!typeId || typeId === "rubedo:database") return;
		const region = Region.locationInRegion(
			entity.location,
			entity.dimension.type
		);
		if (spawnAllowed(region, { entity })) return;
		if (
			region &&
			((Array.isArray(region.permissions.allowedEntitys) &&
				region.permissions.allowedEntitys.includes(typeId)) ||
				region.permissions.allowedEntitys === "all")
		)
			return;

		XEntity.despawn(entity);
	});

	system.runInterval(
		() => {
			if (!Region.CONFIG.PERMS_SETTED) return;

			for (const player of world.getAllPlayers()) {
				const currentRegion = Region.locationInRegion(
					player.location,
					player.dimension.type
				);

				regionCallback(player, currentRegion);
			}
		},
		"pvp region disable",
		20
	);
}
