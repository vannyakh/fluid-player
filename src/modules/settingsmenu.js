export default function settingsMenuModule(playerInstance) {
    const STORAGE_KEY = 'fluidSettingsMenu';
    const LEGACY_STORAGE_KEY = 'fluidSettingsMenu';

    const getStorageKey = () => `${STORAGE_KEY}_${playerInstance.videoPlayerId}`;

    const isAudioProcessingMenuAvailable = () => {
        if (typeof playerInstance.isAudioProcessingSupported === 'function') {
            return playerInstance.isAudioProcessingSupported();
        }

        return true;
    };

    const getDefaultSettings = () => ({
        stableVolume: false,
        voiceBoost: false,
        ambientMode: false,
        annotations: true,
        sleepTimer: 0,
        sleepTimerEndsAt: 0,
        playbackSpeed: 1,
    });

    let cachedSettings = null;

    const isPersistentStorageEnabled = () => {
        const persistent = playerInstance.displayOptions.layoutControls.persistentSettings || {};
        return persistent.settingsMenu !== false;
    };

    const readRawFromStorage = () => {
        const storage = playerInstance.fluidStorage;
        const key = getStorageKey();

        if (!storage) {
            return null;
        }

        let raw = storage[key];

        if (raw == null && storage[LEGACY_STORAGE_KEY] != null) {
            raw = storage[LEGACY_STORAGE_KEY];
        }

        return raw;
    };

    const loadSettingsFromStorage = () => {
        const raw = readRawFromStorage();

        if (typeof raw === 'string' && raw) {
            try {
                return { ...getDefaultSettings(), ...JSON.parse(raw) };
            } catch (error) {
                return getDefaultSettings();
            }
        }

        if (raw && typeof raw === 'object') {
            return { ...getDefaultSettings(), ...raw };
        }

        const settings = getDefaultSettings();

        if (
            playerInstance.displayOptions.layoutControls.persistentSettings?.speed !== false
            && playerInstance.fluidStorage.fluidSpeed != null
        ) {
            const speed = parseFloat(playerInstance.fluidStorage.fluidSpeed, 10);

            if (!Number.isNaN(speed)) {
                settings.playbackSpeed = speed;
            }
        }

        return settings;
    };

    const persistSettingsToStorage = (settings) => {
        const current = cachedSettings || loadSettingsFromStorage();

        cachedSettings = {
            ...getDefaultSettings(),
            ...current,
            ...settings,
        };

        if (!isPersistentStorageEnabled()) {
            return;
        }

        const serialized = JSON.stringify(cachedSettings);

        playerInstance.fluidStorage[getStorageKey()] = serialized;
    };

    const refreshSettingsCache = () => {
        cachedSettings = loadSettingsFromStorage();
    };

    const getStoredSettings = () => {
        if (!cachedSettings) {
            refreshSettingsCache();
        }
        return cachedSettings;
    };

    playerInstance.getSettingsMenuStore = () => ({ ...getStoredSettings() });

    playerInstance.updateSettingsMenuStore = (partial) => {
        persistSettingsToStorage({ ...getStoredSettings(), ...partial });
    };

    const getOptions = () => {
        const menu = playerInstance.displayOptions.layoutControls.settingsMenu || {};
        const audioMenuAvailable = isAudioProcessingMenuAvailable();

        return {
            enabled: menu.enabled !== false,
            stableVolume: audioMenuAvailable && menu.stableVolume !== false,
            voiceBoost: audioMenuAvailable && menu.voiceBoost !== false,
            ambientMode: menu.ambientMode !== false,
            annotations: menu.annotations !== false,
            sleepTimer: menu.sleepTimer !== false,
            playbackSpeed: menu.playbackSpeed !== false,
            quality: menu.quality !== false,
        };
    };

    let sleepTimerId = null;
    let menuRoot = null;
    let mainPanel = null;
    let subPanel = null;
    let subPanelTitle = null;
    let subPanelContent = null;
    let isOpen = false;

    playerInstance.getQualitySourceBadge = (title, isHD = false) => {
        const normalized = String(title).toLowerCase();
        const height = parseInt(normalized, 10);

        if (normalized.includes('8k') || height >= 4320) {
            return '8K';
        }
        if (normalized.includes('4k') || height >= 2160) {
            return '4K';
        }
        if (isHD || (!Number.isNaN(height) && height >= 720)) {
            return 'HD';
        }
        return '';
    };

    playerInstance.buildQualitySourceItemHtml = (title, isHD, selectedClass = '') => {
        const badge = playerInstance.getQualitySourceBadge(title, isHD);
        const badgeHtml = badge ? `<span class="fp_quality_badge">${badge}</span>` : '';

        return `<span class="source_button_icon ${selectedClass}"></span><span class="fluid_quality_item_label">${title}</span>${badgeHtml}`;
    };

    const PLAYBACK_MIN = 0.25;
    const PLAYBACK_MAX = 3;
    const PLAYBACK_STEP = 0.05;
    const PLAYBACK_PRESETS = [1, 1.25, 1.5, 2, 3];

    let playbackPanelElement = null;
    let playbackPanelRefs = null;

    const formatPlaybackRate = (rate) => `${Number(rate).toFixed(2)}x`;

    const clampPlaybackRate = (rate) => Math.min(PLAYBACK_MAX, Math.max(PLAYBACK_MIN, Number(rate)));

    playerInstance.formatPlaybackRate = formatPlaybackRate;

    const clearQualityPanelMode = () => {
        subPanel?.classList.remove('fluid_settings_sub_quality');
        subPanelContent?.classList.remove('fluid_settings_quality_view');
        menuRoot?.classList.remove('fluid_settings_mode_quality');
    };

    const clearPlaybackPanelMode = () => {
        subPanel?.classList.remove('fluid_settings_sub_playback');
        subPanelContent?.classList.remove('fluid_settings_playback_view');
        menuRoot?.classList.remove('fluid_settings_mode_playback');
    };

    const clearSleepPanelMode = () => {
        subPanel?.classList.remove('fluid_settings_sub_sleep');
        subPanelContent?.classList.remove('fluid_settings_sleep_view');
        menuRoot?.classList.remove('fluid_settings_mode_sleep');
    };

    const EXCLUSIVE_TOGGLE_GROUPS = [
        ['stableVolume', 'voiceBoost'],
    ];

    const SLEEP_TIMER_OPTIONS = [
        { label: 'Off', value: 0 },
        { label: '15 minutes', value: 15 },
        { label: '30 minutes', value: 30 },
        { label: '45 minutes', value: 45 },
        { label: '60 minutes', value: 60 },
    ];

    const reconcileExclusiveToggles = (stored, enabledKey = null) => {
        if (!isAudioProcessingMenuAvailable()) {
            stored.stableVolume = false;
            stored.voiceBoost = false;
        }

        EXCLUSIVE_TOGGLE_GROUPS.forEach((group) => {
            if (!isAudioProcessingMenuAvailable() && group.includes('stableVolume')) {
                group.forEach((key) => {
                    stored[key] = false;
                });
                return;
            }

            const activeInGroup = group.filter((key) => stored[key]);

            if (activeInGroup.length > 1) {
                const keepKey = enabledKey && group.includes(enabledKey) && stored[enabledKey]
                    ? enabledKey
                    : activeInGroup[0];

                group.forEach((key) => {
                    stored[key] = key === keepKey;
                });
                return;
            }

            if (activeInGroup.length === 0) {
                const defaultKey = group[0];
                group.forEach((key) => {
                    stored[key] = key === defaultKey;
                });
            }
        });

        return stored;
    };

    const applyExclusiveToggleClick = (stored, id, turningOn) => {
        const group = EXCLUSIVE_TOGGLE_GROUPS.find((keys) => keys.includes(id));

        if (!group) {
            stored[id] = turningOn;
            return;
        }

        const sibling = group.find((key) => key !== id);

        if (turningOn) {
            group.forEach((key) => {
                stored[key] = key === id;
            });
            return;
        }

        if (stored[sibling]) {
            stored[id] = false;
            return;
        }

        stored[id] = false;
        stored[sibling] = true;
    };

    const getExclusiveToggleSnapshot = (stored, group) => (
        Object.fromEntries(group.map((key) => [key, !!stored[key]]))
    );

    const notifySettingsMenuChange = (keys) => {
        if (typeof playerInstance.onSettingsMenuChange !== 'function') {
            return;
        }

        const stored = getStoredSettings();

        keys.forEach((key) => {
            playerInstance.onSettingsMenuChange(key, !!stored[key]);
        });
    };

    const updateSleepTimerPanelUI = () => {
        const list = subPanelContent?.querySelector('.fluid_settings_sleep_list');
        if (!list) {
            return;
        }

        const current = getStoredSettings().sleepTimer || 0;
        list.querySelectorAll('.fluid_settings_option_item').forEach((item) => {
            const value = parseInt(item.dataset.value, 10);
            const isActive = value === current;
            item.classList.toggle('fp_active', isActive);
            item.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    };

    const updatePlaybackSpeedPanelUI = (rate) => {
        if (!playbackPanelRefs) {
            return;
        }

        const currentRate = clampPlaybackRate(rate ?? playerInstance.domRef.player.playbackRate ?? 1);
        const fillPercent = ((currentRate - PLAYBACK_MIN) / (PLAYBACK_MAX - PLAYBACK_MIN)) * 100;

        playbackPanelRefs.valueDisplay.textContent = formatPlaybackRate(currentRate);
        playbackPanelRefs.sliderInput.value = String(currentRate);
        playbackPanelRefs.sliderInput.style.setProperty('--fp-playback-pct', `${fillPercent}%`);

        playbackPanelRefs.presets.querySelectorAll('.fluid_settings_playback_preset').forEach((button) => {
            const preset = parseFloat(button.dataset.rate, 10);
            button.classList.toggle('fp_active', Math.abs(currentRate - preset) < PLAYBACK_STEP);
        });
    };

    const applyPlaybackRate = (rate) => {
        const clamped = clampPlaybackRate(rate);
        playerInstance.setPlaybackSpeed(clamped);
        updatePlaybackSpeedPanelUI(clamped);

        const stored = getStoredSettings();
        stored.playbackSpeed = clamped;
        persistSettingsToStorage(stored);

        if (playerInstance.displayOptions.layoutControls.persistentSettings?.speed) {
            playerInstance.fluidStorage.fluidSpeed = clamped;
        }

        playerInstance.updateSettingsMenuValues?.();
    };

    const buildPlaybackSpeedPanel = () => {
        const panel = document.createElement('div');
        panel.className = 'fluid_settings_playback_panel';

        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'fluid_settings_playback_value';

        const sliderRow = document.createElement('div');
        sliderRow.className = 'fluid_settings_playback_slider_row';

        const minusBtn = document.createElement('button');
        minusBtn.type = 'button';
        minusBtn.className = 'fluid_settings_playback_slider_btn';
        minusBtn.setAttribute('aria-label', 'Decrease playback speed');
        minusBtn.textContent = '−';

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'fluid_settings_playback_slider';

        const sliderInput = document.createElement('input');
        sliderInput.type = 'range';
        sliderInput.className = 'fluid_settings_playback_range';
        sliderInput.min = String(PLAYBACK_MIN);
        sliderInput.max = String(PLAYBACK_MAX);
        sliderInput.step = String(PLAYBACK_STEP);
        sliderInput.setAttribute('aria-label', 'Playback speed');

        const plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'fluid_settings_playback_slider_btn';
        plusBtn.setAttribute('aria-label', 'Increase playback speed');
        plusBtn.textContent = '+';

        sliderWrap.appendChild(sliderInput);
        sliderRow.append(minusBtn, sliderWrap, plusBtn);

        const presets = document.createElement('div');
        presets.className = 'fluid_settings_playback_presets';

        PLAYBACK_PRESETS.forEach((preset) => {
            const presetBtn = document.createElement('button');
            presetBtn.type = 'button';
            presetBtn.className = 'fluid_settings_playback_preset';
            presetBtn.dataset.rate = String(preset);

            if (preset === 1) {
                presetBtn.innerHTML = '1.0x';
            } else {
                presetBtn.textContent = String(preset);
            }

            presetBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                applyPlaybackRate(preset);
            });
            presets.appendChild(presetBtn);
        });

        minusBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            applyPlaybackRate((playerInstance.domRef.player.playbackRate || 1) - PLAYBACK_STEP);
        });

        plusBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            applyPlaybackRate((playerInstance.domRef.player.playbackRate || 1) + PLAYBACK_STEP);
        });

        sliderInput.addEventListener('input', (event) => {
            event.stopPropagation();
            applyPlaybackRate(event.target.value);
        });

        panel.append(valueDisplay, sliderRow, presets);
        playbackPanelRefs = { valueDisplay, sliderInput, presets };

        return panel;
    };

    const updateQualityListUI = (list) => {
        if (!list) {
            return;
        }

        list.querySelectorAll('.fluid_video_source_list_item').forEach((item) => {
            const isActive = !!item.querySelector('.source_selected');
            item.classList.toggle('fp_active', isActive);
            item.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    };

    const prepareQualityListForSettings = (list) => {
        if (!list) {
            return;
        }

        list.classList.add('fluid_settings_quality_list');
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Quality');

        list.querySelectorAll('.fluid_video_source_list_item').forEach((item) => {
            if (item.dataset.settingsQualityBound === '1') {
                return;
            }

            item.dataset.settingsQualityBound = '1';
            item.setAttribute('role', 'option');
            item.setAttribute('tabindex', '0');

            const icon = item.querySelector('.source_button_icon');
            const label = item.querySelector('.fluid_quality_item_label');
            const legacyBadge = item.querySelector('.fp_hd_source');

            if (!label) {
                const classMatch = [...item.classList].find((entry) => entry.startsWith('js-source_'));
                const titleText = classMatch
                    ? classMatch.replace('js-source_', '')
                    : item.textContent.trim().replace(/\s+/g, ' ');
                const isHD = !!legacyBadge;
                const selectedClass = icon?.classList.contains('source_selected') ? 'source_selected' : '';
                item.innerHTML = playerInstance.buildQualitySourceItemHtml(titleText, isHD, selectedClass);
            }

            item.addEventListener('click', (event) => {
                event.stopPropagation();
                setTimeout(() => {
                    updateQualityListUI(list);
                    playerInstance.updateSettingsMenuValues?.();
                }, 0);
            });
        });

        updateQualityListUI(list);
    };

    playerInstance.getSettingsQualityHost = () => {
        if (!getOptions().enabled) {
            return playerInstance.domRef.wrapper?.querySelector('.fluid_control_video_source');
        }
        return playerInstance.domRef.wrapper?.querySelector('.fluid_settings_quality_host');
    };

    playerInstance.getSettingsSpeedHost = () => {
        if (!getOptions().enabled) {
            return playerInstance.domRef.wrapper?.querySelector('.fluid_control_playback_rate');
        }
        return playerInstance.domRef.wrapper?.querySelector('.fluid_settings_speed_host');
    };

    const closeSettingsMenu = () => {
        if (!menuRoot) {
            return;
        }
        menuRoot.classList.remove('fp_show');
        isOpen = false;
        showMainPanel();
        playerInstance.domRef.wrapper?.querySelector('.fluid_control_video_source')?.classList.remove('fluid_settings_active');
    };

    const showMainPanel = () => {
        if (!mainPanel || !subPanel) {
            return;
        }
        restoreListToHost('.fluid_video_sources_list', '.fluid_settings_quality_host');
        restoreListToHost('.fluid_video_playback_rates', '.fluid_settings_speed_host');
        clearQualityPanelMode();
        clearPlaybackPanelMode();
        clearSleepPanelMode();
        mainPanel.style.display = 'block';
        subPanel.style.display = 'none';
    };

    const openSubPanel = (title, contentNode) => {
        if (!subPanel || !subPanelTitle || !subPanelContent) {
            return;
        }
        subPanelTitle.textContent = title;
        subPanelContent.innerHTML = '';
        if (contentNode) {
            subPanelContent.appendChild(contentNode);
        }
        mainPanel.style.display = 'none';
        subPanel.style.display = 'block';
    };

    const createToggleRow = (id, label, iconClass) => {
        const row = document.createElement('div');
        row.className = 'fluid_settings_row fluid_settings_row_toggle';
        row.dataset.settingKey = id;

        row.innerHTML = `
            <span class="fluid_settings_row_icon ${iconClass || ''}"></span>
            <span class="fluid_settings_row_label">${label}</span>
            <button type="button" class="fluid_settings_toggle" aria-pressed="false"></button>
        `;

        const toggle = row.querySelector('.fluid_settings_toggle');
        const storedOnInit = getStoredSettings();
        const active = !!storedOnInit[id];
        toggle.classList.toggle('fp_on', active);
        toggle.setAttribute('aria-pressed', active ? 'true' : 'false');

        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const stored = getStoredSettings();
            const turningOn = !toggle.classList.contains('fp_on');
            const exclusiveGroup = EXCLUSIVE_TOGGLE_GROUPS.find((group) => group.includes(id));
            const beforeSnapshot = exclusiveGroup
                ? getExclusiveToggleSnapshot(stored, exclusiveGroup)
                : { [id]: !!stored[id] };

            applyExclusiveToggleClick(stored, id, turningOn);
            reconcileExclusiveToggles(stored, id);
            persistSettingsToStorage(stored);
            syncMenuToggleUI();

            const keysToNotify = exclusiveGroup
                ? exclusiveGroup.filter((key) => beforeSnapshot[key] !== !!stored[key])
                : (beforeSnapshot[id] !== !!stored[id] ? [id] : []);

            if (keysToNotify.length) {
                notifySettingsMenuChange(keysToNotify);
            }
        });

        return row;
    };

    const createNavRow = (panelId, label, iconClass, valueText = '') => {
        const row = document.createElement('div');
        row.className = 'fluid_settings_row fluid_settings_row_nav';
        row.dataset.panel = panelId;

        row.innerHTML = `
            <span class="fluid_settings_row_icon ${iconClass || ''}"></span>
            <span class="fluid_settings_row_label">${label}</span>
            <span class="fluid_settings_row_value" data-settings-value="${panelId}">${valueText}</span>
            <span class="fluid_settings_row_chevron" aria-hidden="true"></span>
        `;

        row.addEventListener('click', (event) => {
            event.stopPropagation();
            openSettingsSubPanel(panelId);
        });

        return row;
    };

    const applySleepTimer = (minutes) => {
        if (sleepTimerId) {
            clearTimeout(sleepTimerId);
            sleepTimerId = null;
        }

        const stored = getStoredSettings();
        stored.sleepTimer = minutes;
        stored.sleepTimerEndsAt = minutes > 0 ? Date.now() + (minutes * 60 * 1000) : 0;
        persistSettingsToStorage(stored);

        if (minutes > 0) {
            const delayMs = stored.sleepTimerEndsAt - Date.now();

            sleepTimerId = setTimeout(() => {
                if (!playerInstance.domRef.player.paused) {
                    playerInstance.domRef.player.pause();
                }
                stored.sleepTimer = 0;
                stored.sleepTimerEndsAt = 0;
                persistSettingsToStorage(stored);
                playerInstance.updateSettingsMenuValues?.();
                updateSleepTimerPanelUI();
            }, delayMs);
        }

        playerInstance.updateSettingsMenuValues?.();
        updateSleepTimerPanelUI();
    };

    const restoreSleepTimerFromStore = () => {
        const stored = getStoredSettings();

        if (!stored.sleepTimerEndsAt || stored.sleepTimerEndsAt <= Date.now()) {
            if (stored.sleepTimer !== 0 || stored.sleepTimerEndsAt !== 0) {
                stored.sleepTimer = 0;
                stored.sleepTimerEndsAt = 0;
                persistSettingsToStorage(stored);
            }
            return;
        }

        const remainingMs = stored.sleepTimerEndsAt - Date.now();
        stored.sleepTimer = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));

        if (sleepTimerId) {
            clearTimeout(sleepTimerId);
        }

        sleepTimerId = setTimeout(() => {
            if (!playerInstance.domRef.player.paused) {
                playerInstance.domRef.player.pause();
            }
            stored.sleepTimer = 0;
            stored.sleepTimerEndsAt = 0;
            persistSettingsToStorage(stored);
            playerInstance.updateSettingsMenuValues?.();
            updateSleepTimerPanelUI();
        }, remainingMs);
    };

    const syncMenuToggleUI = () => {
        if (!menuRoot) {
            return;
        }

        const stored = getStoredSettings();

        menuRoot.querySelectorAll('.fluid_settings_row_toggle[data-setting-key]').forEach((row) => {
            const settingId = row.dataset.settingKey;
            const toggle = row.querySelector('.fluid_settings_toggle');

            if (!settingId || !toggle) {
                return;
            }

            const active = !!stored[settingId];
            toggle.classList.toggle('fp_on', active);
            toggle.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    };

    const applyStoredSettingsToPlayer = () => {
        refreshSettingsCache();
        const stored = reconcileExclusiveToggles(getStoredSettings());

        persistSettingsToStorage(stored);
        syncMenuToggleUI();

        if (typeof playerInstance.setAmbientMode === 'function') {
            playerInstance.setAmbientMode(!!stored.ambientMode);
        } else if (typeof playerInstance.onSettingsMenuChange === 'function') {
            playerInstance.onSettingsMenuChange('ambientMode', !!stored.ambientMode);
        }

        if (stored.playbackSpeed && playerInstance.displayOptions.layoutControls.persistentSettings?.speed !== false) {
            playerInstance.setPlaybackSpeed(stored.playbackSpeed);
        }

        restoreSleepTimerFromStore();
        playerInstance.updateSettingsMenuValues?.();
    };

    playerInstance.applySettingsMenuStore = applyStoredSettingsToPlayer;
    playerInstance.persistSettingsMenuStore = persistSettingsToStorage;

    const buildSleepTimerPanel = () => {
        const list = document.createElement('div');
        list.className = 'fluid_settings_option_list fluid_settings_sleep_list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Sleep timer');

        const current = getStoredSettings().sleepTimer || 0;

        SLEEP_TIMER_OPTIONS.forEach((option) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'fluid_settings_option_item';
            item.dataset.value = String(option.value);
            item.textContent = option.label;
            item.setAttribute('role', 'option');
            const isActive = option.value === current;
            item.setAttribute('aria-selected', isActive ? 'true' : 'false');

            if (isActive) {
                item.classList.add('fp_active');
            }

            item.addEventListener('click', (event) => {
                event.stopPropagation();
                applySleepTimer(option.value);
            });
            list.appendChild(item);
        });

        return list;
    };

    const restoreListToHost = (listSelector, hostSelector) => {
        const list = playerInstance.domRef.wrapper?.querySelector(listSelector);
        const host = playerInstance.domRef.wrapper?.querySelector(hostSelector);
        if (list && host && list.parentElement !== host) {
            list.style.display = 'none';
            host.appendChild(list);
        }
    };

    const openSettingsSubPanel = (panelId) => {
        if (panelId === 'quality') {
            const list = playerInstance.domRef.wrapper?.querySelector('.fluid_video_sources_list');
            if (list) {
                list.style.display = 'block';
                prepareQualityListForSettings(list);
                clearPlaybackPanelMode();
                clearSleepPanelMode();
                subPanel?.classList.add('fluid_settings_sub_quality');
                subPanelContent?.classList.add('fluid_settings_quality_view');
                menuRoot?.classList.add('fluid_settings_mode_quality');
                openSubPanel('Quality', list);
            }
            return;
        }

        if (panelId === 'speed') {
            if (!playbackPanelElement) {
                playbackPanelElement = buildPlaybackSpeedPanel();
            }

            updatePlaybackSpeedPanelUI();
            clearQualityPanelMode();
            clearSleepPanelMode();
            subPanel?.classList.add('fluid_settings_sub_playback');
            subPanelContent?.classList.add('fluid_settings_playback_view');
            menuRoot?.classList.add('fluid_settings_mode_playback');
            openSubPanel('Playback speed', playbackPanelElement);
            return;
        }

        if (panelId === 'sleepTimer') {
            clearQualityPanelMode();
            clearPlaybackPanelMode();
            subPanel?.classList.add('fluid_settings_sub_sleep');
            subPanelContent?.classList.add('fluid_settings_sleep_view');
            menuRoot?.classList.add('fluid_settings_mode_sleep');
            openSubPanel('Sleep timer', buildSleepTimerPanel());
        }
    };

    playerInstance.updateSettingsMenuValues = () => {
        if (!getOptions().enabled || !menuRoot) {
            return;
        }

        const qualityValue = menuRoot.querySelector('[data-settings-value="quality"]');
        const speedValue = menuRoot.querySelector('[data-settings-value="speed"]');
        const sleepValue = menuRoot.querySelector('[data-settings-value="sleepTimer"]');

        if (qualityValue) {
            const selected = playerInstance.domRef.wrapper?.querySelector('.fluid_video_source_list_item .source_selected');
            let label = 'Auto';

            if (selected) {
                const item = selected.closest('.fluid_video_source_list_item');
                const title = item?.querySelector('.fluid_quality_item_label')?.textContent?.trim();
                const badge = item?.querySelector('.fp_quality_badge')?.textContent?.trim();
                label = title ? (badge ? `${title} ${badge}` : title) : (item?.textContent?.trim().replace(/\s+/g, ' ') || label);
                if (label.length > 28) {
                    label = label.substring(0, 25) + '…';
                }
            } else if (playerInstance.fluidStorage.fluidQuality) {
                const badge = playerInstance.getQualitySourceBadge?.(playerInstance.fluidStorage.fluidQuality);
                label = badge
                    ? `${playerInstance.fluidStorage.fluidQuality} ${badge}`
                    : playerInstance.fluidStorage.fluidQuality;
            }

            qualityValue.textContent = label;
        }

        if (speedValue) {
            const rate = playerInstance.domRef.player.playbackRate || 1;
            speedValue.textContent = rate === 1 ? 'Normal' : formatPlaybackRate(rate);
        }

        if (sleepValue) {
            const minutes = getStoredSettings().sleepTimer || 0;
            sleepValue.textContent = minutes ? `${minutes} min` : 'Off';
        }

        const qualityRow = menuRoot.querySelector('.fluid_settings_row_quality');
        if (qualityRow) {
            const sourceCount = playerInstance.videoSources?.length || 0;
            qualityRow.style.display = sourceCount > 1 ? '' : 'none';
        }

        playerInstance.updateVideoSourceBadge?.();
    };

    playerInstance.openSettingsMenu = () => {
        if (!getOptions().enabled || !menuRoot) {
            return;
        }

        if (playerInstance.isCurrentlyPlayingAd || playerInstance.isShowingSuggestedVideos?.()) {
            return;
        }

        if (isOpen) {
            return;
        }

        showMainPanel();
        menuRoot.classList.add('fp_show');
        isOpen = true;
        playerInstance.updateSettingsMenuValues?.();
        playerInstance.domRef.wrapper?.querySelector('.fluid_control_video_source')?.classList.add('fluid_settings_active');
    };

    playerInstance.openCloseSettingsMenu = () => {
        if (!getOptions().enabled || !menuRoot) {
            playerInstance.openCloseVideoSourceSwitch?.();
            return;
        }

        if (playerInstance.isCurrentlyPlayingAd || playerInstance.isShowingSuggestedVideos?.()) {
            closeSettingsMenu();
            return;
        }

        if (isOpen) {
            closeSettingsMenu();
            return;
        }

        playerInstance.openSettingsMenu();
    };

    playerInstance.closeSettingsMenu = closeSettingsMenu;

    const onSettingsButtonClick = (event) => {
        event.stopPropagation();
        playerInstance.openCloseSettingsMenu();
    };

    playerInstance.bindSettingsButtonClick = () => {
        if (!getOptions().enabled) {
            return;
        }

        const settingsButton = playerInstance.domRef.wrapper?.querySelector('.fluid_control_video_source');

        if (!settingsButton) {
            return;
        }

        if (settingsButton._fpSettingsClickHandler) {
            settingsButton.removeEventListener('click', settingsButton._fpSettingsClickHandler);
        }

        settingsButton._fpSettingsClickHandler = onSettingsButtonClick;
        settingsButton.addEventListener('click', onSettingsButtonClick);
    };

    playerInstance.initSettingsMenu = () => {
        if (!playerInstance.domRef.wrapper) {
            return;
        }

        if (typeof playerInstance.checkAudioProcessingSupport === 'function') {
            playerInstance.checkAudioProcessingSupport();
        }

        const options = getOptions();

        if (!options.enabled) {
            return;
        }

        refreshSettingsCache();
        applyStoredSettingsToPlayer();

        const settingsButton = playerInstance.domRef.wrapper.querySelector('.fluid_control_video_source');
        const playbackButton = playerInstance.domRef.wrapper.querySelector('.fluid_control_playback_rate');

        if (playbackButton && options.playbackSpeed) {
            playbackButton.style.display = 'none';
        }

        menuRoot = document.createElement('div');
        menuRoot.className = 'fluid_settings_menu';

        mainPanel = document.createElement('div');
        mainPanel.className = 'fluid_settings_panel fluid_settings_panel_main';

        subPanel = document.createElement('div');
        subPanel.className = 'fluid_settings_panel fluid_settings_panel_sub';
        subPanel.style.display = 'none';

        const subHeader = document.createElement('div');
        subHeader.className = 'fluid_settings_sub_header';

        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'fluid_settings_back';
        backButton.setAttribute('aria-label', 'Back');
        backButton.addEventListener('click', (event) => {
            event.stopPropagation();
            showMainPanel();
        });

        subPanelTitle = document.createElement('span');
        subPanelTitle.className = 'fluid_settings_sub_title';

        subHeader.appendChild(backButton);
        subHeader.appendChild(subPanelTitle);

        subPanelContent = document.createElement('div');
        subPanelContent.className = 'fluid_settings_sub_content';

        subPanel.appendChild(subHeader);
        subPanel.appendChild(subPanelContent);

        const qualityHost = document.createElement('div');
        qualityHost.className = 'fluid_settings_quality_host';
        qualityHost.style.display = 'none';

        const speedHost = document.createElement('div');
        speedHost.className = 'fluid_settings_speed_host';
        speedHost.style.display = 'none';

        if (options.stableVolume) {
            mainPanel.appendChild(createToggleRow('stableVolume', 'Stable Volume', 'fp_icon_stable_volume'));
        }
        if (options.voiceBoost) {
            mainPanel.appendChild(createToggleRow('voiceBoost', 'Voice boost', 'fp_icon_voice_boost'));
        }
        if (options.ambientMode) {
            mainPanel.appendChild(createToggleRow('ambientMode', 'Ambient mode', 'fp_icon_ambient'));
        }
        if (options.annotations) {
            mainPanel.appendChild(createToggleRow('annotations', 'Annotations', 'fp_icon_annotations'));
        }
        if (options.sleepTimer) {
            mainPanel.appendChild(createNavRow('sleepTimer', 'Sleep timer', 'fp_icon_sleep', 'Off'));
        }
        if (options.playbackSpeed) {
            mainPanel.appendChild(createNavRow('speed', 'Playback speed', 'fp_icon_speed', 'Normal'));
        }
        if (options.quality) {
            const qualityRow = createNavRow('quality', 'Quality', 'fp_icon_quality', 'Auto');
            qualityRow.classList.add('fluid_settings_row_quality');
            mainPanel.appendChild(qualityRow);
        }

        menuRoot.appendChild(mainPanel);
        menuRoot.appendChild(subPanel);
        playerInstance.domRef.wrapper.appendChild(menuRoot);
        playerInstance.domRef.wrapper.appendChild(qualityHost);
        playerInstance.domRef.wrapper.appendChild(speedHost);

        playerInstance.bindSettingsButtonClick?.();

        if (!playerInstance._settingsMenuOutsideClickBound) {
            playerInstance._settingsMenuOutsideClickBound = true;
            document.addEventListener('click', (event) => {
                if (!isOpen || !menuRoot) {
                    return;
                }
                const target = event.target;
                if (menuRoot.contains(target) || settingsButton?.contains(target)) {
                    return;
                }
                closeSettingsMenu();
            });
        }

        playerInstance.updateSettingsMenuValues?.();
    };
};
