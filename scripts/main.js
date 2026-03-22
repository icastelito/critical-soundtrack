const MODULE_ID = "critical-soundtrack";

function isCriticalHit(message) {
	// D&D 5e
	if (message.flags?.dnd5e?.roll?.isCritical === true) return true;
	if (message.flags?.dnd5e?.attack?.isCritical === true) return true;

	// PF2e
	if (message.flags?.pf2e?.context?.outcome === "criticalSuccess") return true;

	// Genérico: d20 natural 20
	if (Array.isArray(message.rolls)) {
		for (const roll of message.rolls) {
			if (roll.isCritical === true) return true;
			for (const term of roll.terms ?? []) {
				if (term.faces === 20 && Array.isArray(term.results)) {
					for (const result of term.results) {
						if (result.active && result.result === 20) return true;
					}
				}
			}
		}
	}

	return false;
}

function getActorFromMessage(message) {
	const speaker = message.speaker;
	if (!speaker) return null;

	if (speaker.actor) {
		const actor = game.actors.get(speaker.actor);
		if (actor) return actor;
	}

	if (speaker.token && speaker.scene) {
		const scene = game.scenes.get(speaker.scene);
		const tokenDoc = scene?.tokens?.get(speaker.token);
		if (tokenDoc?.actor) return tokenDoc.actor;
	}

	return null;
}

async function playCriticalSoundtrack(actor) {
	const playlistId = actor.getFlag(MODULE_ID, "playlistId");

	if (!playlistId) {
		if (game.settings.get(MODULE_ID, "showWarnings")) {
			ui.notifications.warn(game.i18n.format("CRITICAL_SOUNDTRACK.NoPlaylistWarning", { name: actor.name }));
		}
		return;
	}

	const playlist = game.playlists.get(playlistId);
	if (!playlist) return;

	const sounds = playlist.sounds.contents.filter((s) => s.path);
	if (!sounds.length) return;

	const playing = sounds.filter((s) => s.playing);
	for (const s of playing) await playlist.stopSound(s);

	const pick = sounds[Math.floor(Math.random() * sounds.length)];
	await playlist.playSound(pick);

	ui.notifications.info(
		game.i18n.format("CRITICAL_SOUNDTRACK.NowPlaying", {
			name: actor.name,
			track:
				pick.name ||
				pick.path
					.split("/")
					.pop()
					.replace(/\.[^/.]+$/, ""),
		}),
	);
}

async function openAssignDialog(playlistId) {
	const playlist = game.playlists.get(playlistId);
	if (!playlist) return;

	const actors = game.actors.contents
		.filter((a) => !game.settings.get(MODULE_ID, "onlyForPCs") || a.type === "character")
		.sort((a, b) => a.name.localeCompare(b.name));

	if (!actors.length) {
		ui.notifications.warn(game.i18n.localize("CRITICAL_SOUNDTRACK.NoActors"));
		return;
	}

	const options = actors
		.map((a) => {
			const sel = a.getFlag(MODULE_ID, "playlistId") === playlistId ? " selected" : "";
			return `<option value="${a.id}"${sel}>${a.name}</option>`;
		})
		.join("");

	const content = `
		<div class="form-group">
			<label>${game.i18n.localize("CRITICAL_SOUNDTRACK.SelectActor")}</label>
			<select name="actorId">${options}</select>
		</div>
		<p class="hint">${game.i18n.format("CRITICAL_SOUNDTRACK.AssignHint", { playlist: playlist.name })}</p>`;

	try {
		await foundry.applications.api.DialogV2.prompt({
			window: { title: game.i18n.localize("CRITICAL_SOUNDTRACK.AssignTitle") },
			content,
			ok: {
				label: game.i18n.localize("CRITICAL_SOUNDTRACK.Assign"),
				callback: async (_event, button) => {
					const actorId = button.closest("dialog")?.querySelector("select[name=actorId]")?.value;
					if (!actorId) return;
					const actor = game.actors.get(actorId);
					if (!actor) return;
					await actor.setFlag(MODULE_ID, "playlistId", playlistId);
					ui.notifications.info(
						game.i18n.format("CRITICAL_SOUNDTRACK.Assigned", {
							actor: actor.name,
							playlist: playlist.name,
						}),
					);
				},
			},
		});
	} catch (err) {
		console.error(`[${MODULE_ID}]`, err);
	}
}

function getPlaylistId(el) {
	let node = el instanceof HTMLElement ? el : el[0];
	while (node) {
		const id = node.dataset?.documentId ?? node.dataset?.entryId ?? node.dataset?.playlistId;
		if (id) return id;
		node = node.parentElement;
	}
	return null;
}

Hooks.once("init", () => {
	game.settings.register(MODULE_ID, "enabled", {
		name: "CRITICAL_SOUNDTRACK.SettingEnabled",
		hint: "CRITICAL_SOUNDTRACK.SettingEnabledHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(MODULE_ID, "onlyForPCs", {
		name: "CRITICAL_SOUNDTRACK.SettingOnlyPCs",
		hint: "CRITICAL_SOUNDTRACK.SettingOnlyPCsHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
	});

	game.settings.register(MODULE_ID, "showWarnings", {
		name: "CRITICAL_SOUNDTRACK.SettingShowWarnings",
		hint: "CRITICAL_SOUNDTRACK.SettingShowWarningsHint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
	});
});

// Apenas o GM dispara — o sistema nativo de playlists sincroniza com todos os clientes
Hooks.on("createChatMessage", async (message) => {
	if (!game.settings.get(MODULE_ID, "enabled")) return;
	if (!game.user.isGM) return;
	if (!isCriticalHit(message)) return;

	const actor = getActorFromMessage(message);
	if (!actor) return;

	if (game.settings.get(MODULE_ID, "onlyForPCs") && actor.type !== "character") return;

	await playCriticalSoundtrack(actor);
});

// Patch no "setup" — roda antes do sidebar renderizar, garantindo que as opções
// já estejam no prototype quando o ContextMenu é criado pela primeira vez.
Hooks.once("setup", () => {
	const proto = CONFIG.ui?.playlists?.prototype;
	if (typeof proto?._getEntryContextOptions !== "function") return;

	const _orig = proto._getEntryContextOptions;
	proto._getEntryContextOptions = function () {
		const opts = _orig.call(this);
		if (!game.user?.isGM || !Array.isArray(opts)) return opts;

		opts.push({
			name: game.i18n.localize("CRITICAL_SOUNDTRACK.AssignToActor"),
			icon: '<i class="fas fa-music"></i>',
			condition: () => game.user.isGM,
			callback: (li) => openAssignDialog(getPlaylistId(li)),
		});

		opts.push({
			name: game.i18n.localize("CRITICAL_SOUNDTRACK.ClearAssignment"),
			icon: '<i class="fas fa-times"></i>',
			condition: (li) => {
				if (!game.user.isGM) return false;
				const pid = getPlaylistId(li);
				return game.actors.some((a) => a.getFlag(MODULE_ID, "playlistId") === pid);
			},
			callback: async (li) => {
				const pid = getPlaylistId(li);
				const actors = game.actors.filter((a) => a.getFlag(MODULE_ID, "playlistId") === pid);
				for (const actor of actors) await actor.unsetFlag(MODULE_ID, "playlistId");
				const name = game.playlists.get(pid)?.name ?? pid;
				ui.notifications.info(game.i18n.format("CRITICAL_SOUNDTRACK.AssignmentCleared", { playlist: name }));
			},
		});

		return opts;
	};
});

// Se o sidebar já renderizou antes do patch, força a recriação do ContextMenu.
Hooks.once("ready", () => {
	try {
		ui.playlists?._createContextMenus?.();
	} catch (e) {
		console.warn(`[${MODULE_ID}]`, e);
	}
});
