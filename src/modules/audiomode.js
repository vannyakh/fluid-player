export default function audioModeModule(playerInstance) {
    let audioContext = null;
    let mediaSource = null;
    let outputGain = null;
    let stableVolumeNode = null;
    let voiceBoostInput = null;
    let voiceBoostOutput = null;
    let isGraphReady = false;
    let audioProcessingSupport = null;

    const getSettings = () => playerInstance.getSettingsMenuStore?.() || {
        stableVolume: false,
        voiceBoost: false,
    };

    const getVideo = () => playerInstance.domRef.player;

    const getActiveVideoUrl = () => {
        const video = getVideo();

        if (!video) {
            return '';
        }

        const sourceEl = video.querySelector('source');

        return video.currentSrc || video.src || (sourceEl && sourceEl.src) || '';
    };

    const isCrossOriginMediaUrl = (url) => {
        if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
            return false;
        }

        try {
            return new URL(url, window.location.href).origin !== window.location.origin;
        } catch (error) {
            return false;
        }
    };

    const hasWebAudioApi = () => !!(window.AudioContext || window.webkitAudioContext);

    const clearAudioProcessingInStore = () => {
        if (typeof playerInstance.updateSettingsMenuStore === 'function') {
            playerInstance.updateSettingsMenuStore({
                stableVolume: false,
                voiceBoost: false,
            });
        }
    };

    const evaluateAudioProcessingSupportSync = () => {
        if (!hasWebAudioApi() || !getVideo()) {
            return false;
        }

        const mediaUrl = getActiveVideoUrl();

        return !isCrossOriginMediaUrl(mediaUrl);
    };

    const probeCrossOriginCors = async (url) => {
        const request = async (method, headers = {}) => {
            try {
                const response = await fetch(url, {
                    method,
                    mode: 'cors',
                    credentials: 'omit',
                    headers,
                });

                return response.ok || response.status === 206;
            } catch (error) {
                return false;
            }
        };

        if (await request('HEAD')) {
            return true;
        }

        return request('GET', { Range: 'bytes=0-1' });
    };

    const setAudioProcessingSupport = (supported) => {
        const wasSupported = audioProcessingSupport;

        audioProcessingSupport = !!supported;

        if (!audioProcessingSupport && wasSupported !== false) {
            clearAudioProcessingInStore();
            teardownAudioGraph();
        }
    };

    const updateAudioProcessingSupport = async () => {
        if (!hasWebAudioApi() || !getVideo()) {
            setAudioProcessingSupport(false);
            return false;
        }

        const mediaUrl = getActiveVideoUrl();

        if (!isCrossOriginMediaUrl(mediaUrl)) {
            setAudioProcessingSupport(true);
            return true;
        }

        const corsOk = await probeCrossOriginCors(mediaUrl);
        setAudioProcessingSupport(corsOk);
        return corsOk;
    };

    playerInstance.isAudioProcessingSupported = () => {
        if (audioProcessingSupport !== null) {
            return audioProcessingSupport;
        }

        return evaluateAudioProcessingSupportSync();
    };

    playerInstance.checkAudioProcessingSupport = updateAudioProcessingSupport;

    const isAudioProcessingEnabled = () => {
        if (!playerInstance.isAudioProcessingSupported()) {
            return false;
        }

        const settings = getSettings();

        return !!(settings.stableVolume || settings.voiceBoost);
    };

    const disconnectNode = (node) => {
        if (!node) {
            return;
        }

        try {
            node.disconnect();
        } catch (error) {
            // Node may already be disconnected when rebuilding the graph.
        }
    };

    const teardownAudioGraph = () => {
        if (audioContext) {
            audioContext.close().catch(() => {});
        }

        audioContext = null;
        mediaSource = null;
        outputGain = null;
        stableVolumeNode = null;
        voiceBoostInput = null;
        voiceBoostOutput = null;
        isGraphReady = false;
    };

    const applyCrossOriginForWebAudio = () => {
        const video = getVideo();
        const mediaUrl = getActiveVideoUrl();

        if (!video || !isCrossOriginMediaUrl(mediaUrl) || video.crossOrigin === 'anonymous') {
            return false;
        }

        video.crossOrigin = 'anonymous';
        video.load();

        return true;
    };

    const ensureAudioGraph = () => {
        if (!isAudioProcessingEnabled()) {
            return false;
        }

        if (isGraphReady || !getVideo()) {
            return isGraphReady;
        }

        try {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

            if (!AudioContextCtor) {
                setAudioProcessingSupport(false);
                return false;
            }

            audioContext = new AudioContextCtor();
            mediaSource = audioContext.createMediaElementSource(getVideo());
            outputGain = audioContext.createGain();
            outputGain.gain.setValueAtTime(1, audioContext.currentTime);

            stableVolumeNode = audioContext.createDynamicsCompressor();
            stableVolumeNode.threshold.setValueAtTime(-22, audioContext.currentTime);
            stableVolumeNode.knee.setValueAtTime(28, audioContext.currentTime);
            stableVolumeNode.ratio.setValueAtTime(10, audioContext.currentTime);
            stableVolumeNode.attack.setValueAtTime(0.003, audioContext.currentTime);
            stableVolumeNode.release.setValueAtTime(0.2, audioContext.currentTime);

            voiceBoostInput = audioContext.createBiquadFilter();
            voiceBoostInput.type = 'highpass';
            voiceBoostInput.frequency.setValueAtTime(120, audioContext.currentTime);

            const voiceBoostPeak = audioContext.createBiquadFilter();
            voiceBoostPeak.type = 'peaking';
            voiceBoostPeak.frequency.setValueAtTime(2800, audioContext.currentTime);
            voiceBoostPeak.Q.setValueAtTime(0.9, audioContext.currentTime);
            voiceBoostPeak.gain.setValueAtTime(7, audioContext.currentTime);

            const voiceBoostPresence = audioContext.createBiquadFilter();
            voiceBoostPresence.type = 'peaking';
            voiceBoostPresence.frequency.setValueAtTime(4500, audioContext.currentTime);
            voiceBoostPresence.Q.setValueAtTime(1.1, audioContext.currentTime);
            voiceBoostPresence.gain.setValueAtTime(4, audioContext.currentTime);

            voiceBoostInput.connect(voiceBoostPeak);
            voiceBoostPeak.connect(voiceBoostPresence);
            voiceBoostOutput = voiceBoostPresence;

            outputGain.connect(audioContext.destination);
            isGraphReady = true;
            return true;
        } catch (error) {
            setAudioProcessingSupport(false);
            teardownAudioGraph();
            return false;
        }
    };

    const resumeAudioContext = () => {
        if (audioContext && audioContext.state === 'suspended') {
            return audioContext.resume();
        }

        return Promise.resolve();
    };

    const syncOutputVolume = () => {
        if (!isGraphReady || !outputGain || !audioContext || !getVideo()) {
            return;
        }

        const video = getVideo();
        const gain = video.muted ? 0 : video.volume;

        outputGain.gain.setValueAtTime(gain, audioContext.currentTime);
    };

    const rebuildAudioGraph = () => {
        if (!isAudioProcessingEnabled()) {
            return;
        }

        if (!ensureAudioGraph()) {
            return;
        }

        const settings = getSettings();
        const useStableVolume = !!settings.stableVolume;
        const useVoiceBoost = !!settings.voiceBoost;

        disconnectNode(mediaSource);
        disconnectNode(stableVolumeNode);
        disconnectNode(voiceBoostOutput);
        disconnectNode(outputGain);

        if (useStableVolume) {
            mediaSource.connect(stableVolumeNode);
            stableVolumeNode.connect(outputGain);
        } else if (useVoiceBoost) {
            mediaSource.connect(voiceBoostInput);
            voiceBoostOutput.connect(outputGain);
        } else {
            mediaSource.connect(outputGain);
        }

        syncOutputVolume();
    };

    const prepareAudioBeforePlayback = () => {
        if (!isAudioProcessingEnabled()) {
            return Promise.resolve();
        }

        rebuildAudioGraph();

        return resumeAudioContext();
    };

    playerInstance.prepareAudioBeforePlay = prepareAudioBeforePlayback;
    playerInstance.applyAudioModes = prepareAudioBeforePlayback;
    playerInstance.syncAudioOutputVolume = syncOutputVolume;

    const onMediaSourceChange = () => {
        audioProcessingSupport = null;
        updateAudioProcessingSupport();
    };

    playerInstance.initAudioModes = () => {
        const video = getVideo();

        if (video) {
            video.addEventListener('volumechange', syncOutputVolume);
            video.addEventListener('loadedmetadata', onMediaSourceChange);
        }

        updateAudioProcessingSupport();

        playerInstance.destructors.push(() => {
            playerInstance.prepareAudioBeforePlay = null;

            if (video) {
                video.removeEventListener('volumechange', syncOutputVolume);
                video.removeEventListener('loadedmetadata', onMediaSourceChange);
            }

            teardownAudioGraph();
        });
    };

    const previousSettingsChange = playerInstance.onSettingsMenuChange;

    playerInstance.onSettingsMenuChange = (id, value) => {
        if (id === 'stableVolume' || id === 'voiceBoost') {
            if (!value) {
                if (!getSettings().stableVolume && !getSettings().voiceBoost) {
                    teardownAudioGraph();
                } else {
                    rebuildAudioGraph();
                }
            } else if (playerInstance.isAudioProcessingSupported()) {
                const reloaded = applyCrossOriginForWebAudio();

                if (reloaded) {
                    const video = getVideo();
                    const onReady = () => {
                        video.removeEventListener('loadeddata', onReady);
                        rebuildAudioGraph();
                        resumeAudioContext();
                    };

                    video.addEventListener('loadeddata', onReady);
                } else {
                    prepareAudioBeforePlayback();
                }
            }
        }

        if (typeof previousSettingsChange === 'function') {
            previousSettingsChange(id, value);
        }
    };
};
