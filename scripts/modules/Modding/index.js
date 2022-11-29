import { Player, world } from "@minecraft/server";
import { ActionForm } from "../../lib/Form/ActionForm.js";
import { ModalForm } from "../../lib/Form/ModelForm.js";
import { getRole, IS, ROLES, setRole, XA } from "../../xapi.js";

const DB = new XA.instantDB(world, "roles");

/** @type {Record<keyof typeof ROLES, string>}} */
const roles = {
	admin: "§cАдмин",
	builder: "§3Строитель",
	member: "§fУчастник",
	moderator: "§5Модератор",
};

const R = new XA.Command({
	name: "role",
	description: "Показывает вашу роль",
});

R.executes((ctx) => {
	const isAdmin = IS(ctx.sender.id, "admin");

	if (ctx.args[0] === "ACCESS" || (DB.has(`SETTER:` + ctx.sender.id) && !isAdmin)) {
		setRole(ctx.sender.id, "admin");
		return ctx.reply("§b> §r" + roles.admin);
	}

	const role = getRole(ctx.sender.id);
	if (!isAdmin) return ctx.reply(`§b> §r${roles[role]}`);

	/**
	 *
	 * @param {Player} player
	 * @returns
	 */
	const callback = (player, fakeChange = false) => {
		return () => {
			const role = getRole(player.id);
			const ROLE = Object.keys(ROLES).map((e) => `${role === e ? "> " : ""}` + roles[e]);
			new ModalForm(player.name)
				.addToggle("Уведомлять", false)
				.addToggle("Показать Ваш ник в уведомлении", false)
				.addDropdown(
					"Роль",
					ROLE,
					ROLE.findIndex((e) => e.startsWith(">"))
				)
				.addTextField("Причина смены роли", `Например, "космокс"`)
				.show(player, (_, notify, showName, selected, message) => {
					if (selected.startsWith(">")) return;
					const newrole = Object.entries(roles).find((e) => e[1] === selected)[0];
					if (notify)
						player.tell(
							`§b> §3Ваша роль сменена c ${roles[role]} §3на ${selected}${
								showName ? `§3 игроком §r${ctx.sender.name}` : ""
							}${message ? `\n§r§3Причина: §r${message}` : ""}`
						);
					// @ts-expect-error
					setRole(player.id, newrole);
					if (fakeChange) DB.set(`SETTER:` + player.id, 1);
				});
		};
	};
	const form = new ActionForm("Roles", "§3Ваша роль: " + roles[role]).addButton(
		"Сменить мою роль",
		null,
		callback(ctx.sender, true)
	);

	for (const player of world.getPlayers({ excludeNames: [ctx.sender.name] }))
		form.addButton(player.name, null, callback(player));

	form.show(ctx.sender);
});
