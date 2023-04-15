import { Vector } from "@minecraft/server";
import { toStr, XA } from "xapi.js";

const root = new XA.Command({
	name: "id",
	description: "Выдает айди",
	role: "moderator",
	type: "test",
});

root.executes((ctx) => {
	const item = XA.Entity.getHeldItem(ctx.sender);
	if (!item) return ctx.reply("§cВ руке нет предмета!");
	ctx.reply(
		`§b► §f${item?.typeId.replace("minecraft:", "")} ${
			item?.nameTag ? item?.nameTag : ""
		}`
	);
});

root
	.literal({ name: "l", description: "Выдает id блока по локации" })
	.location("location", true)
	.executes((ctx, location) => {
		const l = Vector.floor(location);
		const block = ctx.sender.dimension.getBlock(l);
		if (!block) return ctx.reply("§cНет блока!");
		ctx.reply(`§b► §f${block.typeId.replace("minecraft:", "")}`);
	});

root
	.literal({ name: "p", description: "Выдает все properties блока по локации" })
	.location("location", true)
	.executes((ctx, location) => {
		const l = Vector.floor(location);
		const block = ctx.sender.dimension.getBlock(l);
		if (!block) return ctx.reply("§cНет блока!");
		ctx.reply(toStr(block.permutation.getAllProperties()));
	});

root
	.literal({ name: "r", description: "Выдает наклон головы" })
	.executes((ctx) => {
		ctx.reply(
			`§a► §f${ctx.sender.getRotation().x} ${ctx.sender.getRotation().y}`
		);
	});

root.literal({ name: "c", description: "очсищ" }).executes((ctx) => {
	const tag = XA.Entity.getTagStartsWith(ctx.sender, "st:");
	ctx.reply(`§b► §c-§f${tag}`);
	XA.Entity.removeTagsStartsWith(ctx.sender, "st:");
});

root.literal({ name: "a", description: "добав" }).executes((ctx) => {
	const blocks = [];
	XA.Entity.getTagStartsWith(ctx.sender, "st:")
		?.split(",")
		?.every((e) => blocks.push(e));
	blocks.push(`${XA.Entity.getHeldItem(ctx.sender)?.typeId}`);
	ctx.reply(`§a► §f${blocks.join(", ")}`);
	XA.Entity.removeTagsStartsWith(ctx.sender, "st:");
	ctx.sender.addTag("st:" + blocks.join(","));
});
root
	.literal({ name: "st", description: "Задает лор предмета" })
	.executes((ctx) => {
		let item = XA.Entity.getHeldItem(ctx.sender);
		let oldtag = item.getLore();
		item.setLore([XA.Entity.getTagStartsWith(ctx.sender, "st:")]);
		XA.Entity.getI(ctx.sender).setItem(ctx.sender.selectedSlot, item);
		ctx.reply(`§a► §f${oldtag ?? ""} ► ${item.getLore()}`);
	});
