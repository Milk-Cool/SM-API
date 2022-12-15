import {
	BlockLocation,
	DynamicPropertiesDefinition,
	Entity,
	EntityTypes,
	ItemStack,
	MinecraftItemTypes,
	system,
	world,
} from "@minecraft/server";
import { DIMENSIONS } from "../List/dimensions.js";

world.events.worldInitialize.subscribe(({ propertyRegistry }) => {
	let def = new DynamicPropertiesDefinition();
	def.defineString("tableName", 30);
	def.defineNumber("index");
	propertyRegistry.registerEntityTypeDynamicProperties(def, EntityTypes.get(ENTITY_IDENTIFIER));
});

/**
 * This is air as a item,
 */
export const AIR = new ItemStack(MinecraftItemTypes.stick, 0);
const MAX_DATABASE_STRING_SIZE = 32000;
const ENTITY_IDENTIFIER = "rubedo:database";
const ENTITY_LOCATION = new BlockLocation(0, -64, 0);
const INVENTORY_SIZE = 128;

/**
 * Splits a string into chunk sizes
 * @param {string} str
 * @param {number} length
 * @returns {string[]}
 */
function chunkString(str, length) {
	return str.match(new RegExp(".{1," + length + "}", "g"));
}

let WORLD_IS_LOADED = false;

/** @type {Function[]} */
const onLoad = [];

let s = system.runSchedule(async () => {
	try {
		await DIMENSIONS.overworld.runCommandAsync(`testfor @a`);
		system.clearRunSchedule(s);
		WORLD_IS_LOADED = true;
		onLoad.forEach((e) => e());
	} catch (error) {}
}, 1);

/**
 * Awaits till work load
 * @returns {Promise<void>}
 */
export async function awaitWorldLoad() {
	if (WORLD_IS_LOADED) return;
	return new Promise((resolve) => {
		onLoad.push(resolve);
	});
}

/**
 * Sends a callback once world is loaded
 * @param {() => void} callback  undefined
 * @returns {void}
 */
export function onWorldLoad(callback) {
	if (WORLD_IS_LOADED) return callback();
	onLoad.push(callback);
}

/** @type {Record<string, Database<any, any>>} */
export const CreatedInstances = {};

/**
 * @template {string} [Key = string]
 * @template [Value=any]
 */
export class Database {
	/**
	 * Creates a table entity that is used for data storage
	 * @param {string} tableName  undefined
	 * @param {number} [index] if not specified no index will be set
	 * @returns {Entity} *
	 */
	static createTableEntity(tableName, index) {
		const entity = DIMENSIONS.overworld.spawnEntity(ENTITY_IDENTIFIER, ENTITY_LOCATION);
		entity.setDynamicProperty("tableName", tableName);
		entity.nameTag = `§7Database Table: §f${tableName}§r`;
		if (index) entity.setDynamicProperty("index", index);
		return entity;
	}
	/**
	 * Gets all table Entities associated with this tableName
	 * @param {string} tableName  undefined
	 * @returns {Entity[]} *
	 */
	static getTableEntities(tableName) {
		try {
			return DIMENSIONS.overworld
				.getEntitiesAtBlockLocation(ENTITY_LOCATION)
				.filter((e) => e?.typeId === ENTITY_IDENTIFIER && e?.getDynamicProperty("tableName") === tableName);
		} catch (e) {
			return [];
		}
	}
	/**
	 * Data saved in memory
	 * @type {{ [key in Key]: Value } | null}
	 * @private
	 */
	MEMORY;
	/**
	 * List of queued tasks on this table
	 * @type {Array<() => void>}
	 * @private
	 */
	QUEUE;
	/**
	 *
	 * @param {string} tableName
	 */
	constructor(tableName) {
		if (tableName in CreatedInstances) return CreatedInstances[tableName];
		world.say(tableName);
		this.tableName = tableName;
		this.MEMORY = null;
		this.QUEUE = [];

		system.runSchedule(() => {
			if (this.QUEUE.length == 0) return;
			this.QUEUE.shift()?.(); // removes queue item and runs it
		}, 1);

		onWorldLoad(() => {
			this.MEMORY = this.getData();
		});
		CreatedInstances[tableName] = this;
	}
	/**
	 * Adds a queue task to be awaited
	 * @returns {Promise<void>} once its this items time to run in queue
	 * @private
	 */
	async addQueueTask() {
		return new Promise((resolve) => {
			this.QUEUE.push(() => {
				resolve();
			});
		});
	}
	/**
	 * Saves data into this database
	 * @param {{ [key in Key]: Value }} data
	 * @returns {Promise<void>} once data is saved
	 * @private
	 */
	async saveData(data) {
		await this.addQueueTask();
		await awaitWorldLoad(); // Await till world is loaded
		this.MEMORY = data; // set memory
		let entities = Database.getTableEntities(this.tableName);
		/**
		 * The split chunks of the stringified data, This is done because we can
		 * only store {@link MAX_DATABASE_STRING_SIZE} chars in a single nameTag
		 */
		let chunks = chunkString(JSON.stringify(data), MAX_DATABASE_STRING_SIZE);
		/**
		 * The amount of entities that is needed to store {@link chunks} data
		 */
		const entitiesNeeded = Math.ceil(chunks.length / INVENTORY_SIZE) - entities.length;
		if (entitiesNeeded > 0) {
			for (let i = 0; i < entitiesNeeded; i++) {
				entities.push(Database.createTableEntity(this.tableName));
			}
		}
		for (const [i, entity] of entities.entries()) {
			const inventory = entity.getComponent("inventory").container;
			for (const [i, chunk] of chunks.entries()) {
				if (!chunk) continue;
				if (i > inventory.size - 1) break; // Exit because it has maxed items
				let item = new ItemStack(MinecraftItemTypes.acaciaBoat);
				item.nameTag = chunk;
				inventory.setItem(i, item);
				chunks[i] = null; // Delete chunk because its been set.
			}
			// Set all unUsed slots to air
			for (let i = chunks.length + 1; i < inventory.size; i++) {
				inventory.setItem(i, AIR);
			}
			entity.setDynamicProperty("index", i);
			entities[i] = null; // Set this entity to null because its maxed out!
			// If all chunks have been saved no need to go to next entity
			if (!chunks.find((v) => v)) break;
		}
		// Check for unUsed entities and despawn them
		entities.filter((e) => e).forEach((e) => e.triggerEvent("despawn"));
		return;
	}
	/**
	 * Grabs all data from this table
	 * @returns {{ [key in Key]: Value; }}
	 * @private
	 */
	getData() {
		// await awaitWorldLoad(); // Await till world is loaded
		if (this.MEMORY) return this.MEMORY;
		let entities = Database.getTableEntities(this.tableName).sort(
			// @ts-expect-error
			(a, b) => a.getDynamicProperty("index") - b.getDynamicProperty("index")
		);
		let stringifiedData = "";
		for (const entity of entities) {
			const inventory = entity.getComponent("inventory").container;
			for (let i = 0; i < inventory.size; i++) {
				const item = inventory.getItem(i);
				if (!item) continue;
				stringifiedData = stringifiedData + item.nameTag;
			}
		}
		return stringifiedData === "" ? {} : JSON.parse(stringifiedData);
	}
	/**
	 *  Saves data into this database
	 * @param {{ [key in Key]: Value }} collection
	 * @returns {Promise<void>} once data is saved
	 */
	async saveCollection(collection) {
		return this.saveData(collection);
	}
	/**
	 * Sets a key to a value in this table
	 * @param {Key} key  undefined
	 * @param {Value} value  undefined
	 * @returns {Promise<void>}
	 */
	async set(key, value) {
		const data = await this.getData();
		data[key] = value;
		await this.saveData(data);
		return;
	}
	/**
	 * Gets a value from this table
	 * @param {Key} key  undefined
	 * @returns {Value} the keys corresponding key
	 */
	get(key) {
		if (!this.MEMORY) throw new Error("World is not loaded! Consider using `getAsync` instead!");
		return this.MEMORY[key];
	}
	/**
	 * Gets a value async from this table, this should be used on calls from like
	 * entityCreate, system.runSchedule or things that could be before database entities spawn
	 * @param {Key} key  undefined
	 * @returns {Promise<Value>}
	 */
	async getSync(key) {
		const data = await this.getData();
		return data[key];
	}
	/**
	 * Get all the keys in the table
	 * @returns {Key[]}
	 */
	keys() {
		if (!this.MEMORY) throw new Error("World is not loaded! Consider using `keysSync` instead!");
		// @ts-expect-error
		return Object.keys(this.MEMORY);
	}
	/**
	 * Get all the keys in the table async, this should be used on world load
	 * @returns {Promise<Key[]>}
	 */
	async keysSync() {
		const data = await this.getData();
		// @ts-expect-error
		return Object.keys(data);
	}
	/**
	 * Get all the values in the table
	 * @returns {Value[]}
	 */
	values() {
		if (!this.MEMORY) throw new Error("World is not loaded! Consider using `valuesSync` instead!");
		return Object.values(this.MEMORY);
	}
	/**
	 * Get all the values in the table async, this should be used on world load
	 * @returns {Promise<Value[]>}
	 */
	async valuesSync() {
		const data = await this.getData();
		return Object.values(data);
	}
	/**
	 * Check if the key exists in the table
	 * @param {Key} key  the key to test
	 * @returns {boolean}
	 */
	has(key) {
		if (!this.MEMORY) throw new Error("World is not loaded! Consider using `hasSync` instead!");
		const keys = this.keys();
		return keys.includes(key);
	}
	/**
	 * Check if the key exists in the table async, this should be used on worldLoad
	 * @param {Key} key  the key to test
	 * @returns {Promise<boolean>}
	 */
	async hasSync(key) {
		const keys = await this.keysSync();
		return keys.includes(key);
	}
	/**
	 * Gets all the keys and values
	 * @returns {{ [key in Key]: Value; }}
	 */
	collection() {
		if (!this.MEMORY) throw new Error("World is not loaded! Consider using `collectionSync` instead!");
		return this.MEMORY;
	}
	/**
	 * Gets all the keys and values async, this should be used for grabbingCollection on world load
	 * @returns {Promise<{ [key in Key]: Value; }>}
	 */
	async collectionSync() {
		return await this.getData();
	}
	/**
	 * Delete the key from the table
	 * @param {Key} key  the key to delete
	 * @returns {boolean}
	 */
	delete(key) {
		const status = delete this.MEMORY[key];
		this.saveData(this.MEMORY);
		return status;
	}
	/**
	 * Delete the key from the table
	 * @param {Key} key  the key to delete
	 * @returns {Promise<boolean>}
	 */
	async deleteSync(key) {
		await awaitWorldLoad();
		const data = await this.getData();
		const status = delete data[key];
		await this.saveData(data);
		return status;
	}
	/**
	 * Clear everything in the table
	 * @returns {Promise<void>}
	 */
	async clear() {
		// @ts-expect-error
		await this.saveData({});
		return;
	}
}
