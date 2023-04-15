import { world } from "@minecraft/server";
import { Region } from "../../Server/Region/Region.js";
import { setRegionGuards } from "../../Server/Region/index.js";
import { RaidNotify } from "./var.js";

world.beforeEvents.explosion.subscribe((data) => {
	for (const bl of data.getImpactedBlocks()) {
		let region = Region.blockLocationInRegion(bl, data.dimension.id);
		if (region && !region.permissions.pvp) return (data.cancel = true);
		for (const id of region.permissions.owners) RaidNotify[id] = 60;
	}
});

setRegionGuards(
	// Common actions guard
	(player, region) =>
		!region ||
		player.hasTag("modding") ||
		region.permissions.owners.includes(player.id),

	// Spawn entity guard
	(region, data) => !region
);

Region.DEFAULT_REGION_PERMISSIONS.pvp = true;
