const MODULE_ID = "critical-soundtrack";

let _activeSound = null;

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

function getActorConfig(actor) {
	return foundry.utils.deepClone(
		actor.getFlag(MODULE_ID, "config") ?? {
			tracks: [],
			volume: 0.8,
			playMode: "random",
			duration: 0,
		},
	);
}

async function playAudio(src, volume) {
	return foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false });
}

async function playCriticalSoundtrack(actor) {
	const config = getActorConfig(actor);

	if (!config.tracks || config.tracks.length === 0) {
		if (game.settings.get(MODULE_ID, "showWarnings")) {
			ui.notifications.warn(game.i18n.format("CRITICAL_SOUNDTRACK.NoTracksWarning", { name: actor.name }));
		}
		return;
	}

	let track;
	if (config.playMode === "sequential") {
		const lastIndex = actor.getFlag(MODULE_ID, "lastTrackIndex") ?? -1;
		const nextIndex = (lastIndex + 1) % config.tracks.length;
		track = config.tracks[nextIndex];
		// Só o GM persiste o índice para evitar conflitos
		if (game.user.isGM) {
			await actor.setFlag(MODULE_ID, "lastTrackIndex", nextIndex);
		}
	} else {
		track = config.tracks[Math.floor(Math.random() * config.tracks.length)];
	}

	if (!track?.src) return;

	const volume = track.volume ?? config.volume ?? 0.8;

	if (_activeSound) {
		try {
			_activeSound.stop();
		} catch (_) {}
		_activeSound = null;
	}

	try {
		_activeSound = await playAudio(track.src, volume);

		if (config.duration > 0 && _activeSound) {
			setTimeout(async () => {
				if (!_activeSound) return;
				try {
					if (_activeSound.fade) await _activeSound.fade(0, { duration: 1500 });
					_activeSound.stop();
				} catch (_) {}
				_activeSound = null;
			}, config.duration * 1000);
		}

		const label =
			track.label ||
			track.src
				.split("/")
				.pop()
				.replace(/\.[^/.]+$/, "");
		ui.notifications.info(
			game.i18n.format("CRITICAL_SOUNDTRACK.NowPlaying", {
				name: actor.name,
				track: label,
			}),
		);
	} catch (err) {
		console.error(`${MODULE_ID} | Erro ao reproduzir trilha sonora:`, err);
		ui.notifications.error(game.i18n.localize("CRITICAL_SOUNDTRACK.AudioError"));
	}
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class SoundtrackConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(actor, options = {}) {
		super(options);
		this.actor = actor;
		this._config = getActorConfig(actor);
	}

	static DEFAULT_OPTIONS = {
		id: "critical-soundtrack-config",
		window: {
			title: "CRITICAL_SOUNDTRACK.ConfigTitle",
			resizable: true,
		},
		position: { width: 520 },
		actions: {
			addTrack: SoundtrackConfigApp._onAddTrack,
			removeTrack: SoundtrackConfigApp._onRemoveTrack,
			browseFile: SoundtrackConfigApp._onBrowseFile,
			testPlay: SoundtrackConfigApp._onTestPlay,
			save: SoundtrackConfigApp._onSave,
		},
	};

	static PARTS = {
		form: { template: `modules/${MODULE_ID}/templates/soundtrack-config.hbs` },
	};

	async _prepareContext(options) {
		return {
			actorName: this.actor.name,
			tracks: this._config.tracks.map((t, i) => ({ ...t, _index: i, _number: i + 1 })),
			volume: this._config.volume,
			playMode: this._config.playMode,
			duration: this._config.duration,
			playModes: [
				{ value: "random", label: game.i18n.localize("CRITICAL_SOUNDTRACK.PlayModeRandom") },
				{ value: "sequential", label: game.i18n.localize("CRITICAL_SOUNDTRACK.PlayModeSequential") },
			],
		};
	}

	_onRender(context, options) {
		this.element.querySelectorAll("input[type=range]").forEach((el) => {
			el.addEventListener("input", (ev) => {
				const group = ev.currentTarget.closest(".cs-range-group");
				if (group)
					group.querySelector(".cs-range-value").textContent = parseFloat(ev.currentTarget.value).toFixed(2);
			});
		});
	}

	_syncFromForm() {
		const form = this.element.querySelector("form");
		if (!form) return;
		try {
			const data = new foundry.applications.ux.FormDataExtended(form).object;
			this._applyFormData(data);
		} catch (e) {}
	}

	_applyFormData(formData) {
		this._config.volume = parseFloat(formData.volume) || 0.8;
		this._config.playMode = formData.playMode ?? "random";
		this._config.duration = parseFloat(formData.duration) || 0;
		for (let i = 0; i < this._config.tracks.length; i++) {
			if (formData[`track-src-${i}`] !== undefined) this._config.tracks[i].src = formData[`track-src-${i}`];
			if (formData[`track-volume-${i}`] !== undefined)
				this._config.tracks[i].volume = parseFloat(formData[`track-volume-${i}`]) || 0.8;
			if (formData[`track-label-${i}`] !== undefined) this._config.tracks[i].label = formData[`track-label-${i}`];
		}
	}

	static _onAddTrack(event) {
		this._syncFromForm();
		this._config.tracks.push({ src: "", volume: 0.8, label: "" });
		this.render();
	}

	static _onRemoveTrack(event, target) {
		this._syncFromForm();
		this._config.tracks.splice(parseInt(target.dataset.index), 1);
		this.render();
	}

	static _onBrowseFile(event, target) {
		this._syncFromForm();
		const index = parseInt(target.dataset.index);
		new FilePicker({
			type: "audio",
			current: this._config.tracks[index]?.src ?? "",
			callback: (path) => {
				this._config.tracks[index].src = path;
				this.render();
			},
		}).browse();
	}

	static async _onTestPlay(event, target) {
		this._syncFromForm();
		const track = this._config.tracks[parseInt(target.dataset.index)];
		if (!track?.src) return ui.notifications.warn(game.i18n.localize("CRITICAL_SOUNDTRACK.NoTrackSelected"));
		try {
			await playAudio(track.src, track.volume ?? this._config.volume ?? 0.8);
		} catch (err) {
			ui.notifications.error(game.i18n.localize("CRITICAL_SOUNDTRACK.AudioError"));
		}
	}

	static async _onSave(event) {
		this._syncFromForm();
		await this.actor.setFlag(MODULE_ID, "config", this._config);
		ui.notifications.info(game.i18n.format("CRITICAL_SOUNDTRACK.Saved", { name: this.actor.name }));
		this.close();
	}
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

Hooks.once("ready", () => {
	console.log(`${MODULE_ID} | pronto`);
});

Hooks.on("createChatMessage", async (message) => {
	if (!game.settings.get(MODULE_ID, "enabled")) return;
	if (!isCriticalHit(message)) return;

	const actor = getActorFromMessage(message);
	if (!actor) return;

	if (game.settings.get(MODULE_ID, "onlyForPCs") && actor.type !== "character") return;

	await playCriticalSoundtrack(actor);
});

// V1 sheets (Foundry v11/v12 e sistemas legados)
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
	if (!game.user.isGM && !sheet.actor.isOwner) return;

	buttons.unshift({
		label: game.i18n.localize("CRITICAL_SOUNDTRACK.ConfigButton"),
		class: "critical-soundtrack-config-btn",
		icon: "fas fa-music",
		onclick: () => new SoundtrackConfigApp(sheet.actor).render(true),
	});
});

// V2 sheets (Foundry v13): hook genérico de ApplicationV2
// "renderActorSheet" NÃO dispara para apps AppV2; usa-se "renderApplication"
Hooks.on("renderApplication", (app) => {
	// Filtra apenas janelas de fichas de atores
	const actor = app.document instanceof Actor ? app.document : null;
	if (!actor) return;
	if (!game.user.isGM && !actor.isOwner) return;

	const appEl = app.element instanceof HTMLElement ? app.element : app.element?.[0];
	if (!appEl) return;

	// Evita duplicata (sheets legados já recebem o botão via getActorSheetHeaderButtons)
	if (appEl.querySelector(".critical-soundtrack-config-btn")) return;

	const header = appEl.querySelector(".window-header");
	if (!header) return;

	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "critical-soundtrack-config-btn";
	btn.title = game.i18n.localize("CRITICAL_SOUNDTRACK.ConfigButton");
	btn.innerHTML = `<i class="fas fa-music"></i>`;
	btn.addEventListener("click", () => new SoundtrackConfigApp(actor).render(true));
	header.append(btn);
});
