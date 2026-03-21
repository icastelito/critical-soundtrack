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

// Compatibilidade v11/v12
async function playAudio(src, volume) {
	if (foundry.audio?.AudioHelper?.play) {
		return foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false });
	}
	if (typeof AudioHelper !== "undefined" && AudioHelper.play) {
		return AudioHelper.play({ src, volume, autoplay: true, loop: false });
	}
	console.error(`${MODULE_ID} | API de áudio não encontrada.`);
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

class SoundtrackConfigApp extends FormApplication {
	constructor(actor, options = {}) {
		super(actor, options);
		this.actor = actor;
		this._config = getActorConfig(actor);
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "critical-soundtrack-config",
			title: game.i18n.localize("CRITICAL_SOUNDTRACK.ConfigTitle"),
			template: `modules/${MODULE_ID}/templates/soundtrack-config.hbs`,
			width: 520,
			height: "auto",
			closeOnSubmit: true,
			resizable: true,
		});
	}

	getData() {
		return {
			actorName: this.actor.name,
			tracks: this._config.tracks.map((t, i) => ({ ...t, _index: i, _number: i + 1 })),
			volume: this._config.volume,
			playMode: this._config.playMode,
			duration: this._config.duration,
			playModes: [
				{
					value: "random",
					label: game.i18n.localize("CRITICAL_SOUNDTRACK.PlayModeRandom"),
				},
				{
					value: "sequential",
					label: game.i18n.localize("CRITICAL_SOUNDTRACK.PlayModeSequential"),
				},
			],
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find(".cs-add-track").on("click", this._onAddTrack.bind(this));
		html.find(".cs-remove-track").on("click", this._onRemoveTrack.bind(this));
		html.find(".cs-browse-file").on("click", this._onBrowseFile.bind(this));
		html.find(".cs-test-play").on("click", this._onTestPlay.bind(this));

		html.find("input[type=range]").on("input", (ev) => {
			const val = parseFloat(ev.currentTarget.value).toFixed(2);
			$(ev.currentTarget).siblings(".cs-range-value").text(val);
		});
	}

	_syncFromForm() {
		if (!this.element?.length) return;
		const form = this.element.find("form")[0];
		if (!form) return;
		try {
			const FDE =
				foundry.applications?.ux?.FormDataExtended ??
				(typeof FormDataExtended !== "undefined" ? FormDataExtended : null);
			if (!FDE) return;
			const data = new FDE(form).object;
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

	_onAddTrack(event) {
		event.preventDefault();
		this._syncFromForm();
		this._config.tracks.push({ src: "", volume: 0.8, label: "" });
		this.render(true);
	}

	_onRemoveTrack(event) {
		event.preventDefault();
		this._syncFromForm();
		const index = parseInt(event.currentTarget.dataset.index);
		this._config.tracks.splice(index, 1);
		this.render(true);
	}

	_onBrowseFile(event) {
		event.preventDefault();
		this._syncFromForm();
		const index = parseInt(event.currentTarget.dataset.index);
		const fp = new FilePicker({
			type: "audio",
			current: this._config.tracks[index]?.src ?? "",
			callback: (path) => {
				this._config.tracks[index].src = path;
				this.render(true);
			},
		});
		fp.browse();
	}

	async _onTestPlay(event) {
		event.preventDefault();
		this._syncFromForm();
		const index = parseInt(event.currentTarget.dataset.index);
		const track = this._config.tracks[index];
		if (!track?.src) {
			return ui.notifications.warn(game.i18n.localize("CRITICAL_SOUNDTRACK.NoTrackSelected"));
		}
		try {
			await playAudio(track.src, track.volume ?? this._config.volume ?? 0.8);
		} catch (err) {
			ui.notifications.error(game.i18n.localize("CRITICAL_SOUNDTRACK.AudioError"));
		}
	}

	async _updateObject(event, formData) {
		this._applyFormData(formData);
		await this.actor.setFlag(MODULE_ID, "config", this._config);
		ui.notifications.info(game.i18n.format("CRITICAL_SOUNDTRACK.Saved", { name: this.actor.name }));
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

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
	if (!game.user.isGM && !sheet.actor.isOwner) return;

	buttons.unshift({
		label: game.i18n.localize("CRITICAL_SOUNDTRACK.ConfigButton"),
		class: "critical-soundtrack-config-btn",
		icon: "fas fa-music",
		onclick: () => new SoundtrackConfigApp(sheet.actor).render(true),
	});
});
