import { Player } from "@minecraft/server";
import { Database } from "./Database/Rubedo.js";

/** @type {Database<string, {role: keyof typeof ROLES}>} */
const table = new Database("player", {
	defaultValue() {
		return { role: "member" };
	},
});

/**
 * The roles that are in this server
 */
export const ROLES = {
	admin: "§cАдмин",
	moderator: "§5Модератор",
	builder: "§3Строитель",
	member: "§fУчастник",
};

/**
 * Gets the role of this player
 * @param  {Player | string} playerID player or his id to get role from
 * @returns {keyof typeof ROLES}
 * @example getRole("23529890")
 */
export function getRole(playerID) {
	if (playerID instanceof Player) playerID = playerID.id;

	const role = table.get(playerID).role;

	if (!Object.keys(ROLES).includes(role)) return "member";
	return role;
}

/**
 * Sets the role of this player
 * @example setRole("342423452", "admin")
 * @param {Player | string} player
 * @param {keyof typeof ROLES} role
 * @returns {void}
 */
export function setRole(player, role) {
	if (player instanceof Player) player = player.id;
	const { data, save } = table.work(player);
	data.role = role;
	save();
}

/**
 * Checks if player role included in given array
 * @param {string} playerID
 * @param {keyof typeof ROLES} role
 */
export function is(playerID, role) {
	/** @type {(keyof typeof ROLES)[]} */
	let arr = ["moderator", "admin"];

	if (role === "member") return true;
	if (role === "builder") arr.push("builder");
	if (role === "admin") arr = ["admin"];

	return arr.includes(getRole(playerID));
}