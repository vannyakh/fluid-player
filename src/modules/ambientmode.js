const GLOW_PRESETS = {
    subtle: {
        bleedPadding: 10,
        bleedBlur: 10,
        glowBrightness: 1.06,
        glowSaturation: 1.12,
        glowOpacity: 0.45,
        canvasOpacity: 0.42,
        canvasBrightness: 1.04,
        canvasSaturate: 1.15,
        scaleMultiplier: 1,
    },
    normal: {
        bleedPadding: 18,
        bleedBlur: 14,
        glowBrightness: 1.12,
        glowSaturation: 1.22,
        glowOpacity: 0.58,
        canvasOpacity: 0.52,
        canvasBrightness: 1.08,
        canvasSaturate: 1.22,
        scaleMultiplier: 1.06,
    },
    strong: {
        bleedPadding: 32,
        bleedBlur: 22,
        glowBrightness: 1.22,
        glowSaturation: 1.35,
        glowOpacity: 0.75,
        canvasOpacity: 0.7,
        canvasBrightness: 1.12,
        canvasSaturate: 1.32,
        scaleMultiplier: 1.14,
    },
};

const DEFAULT_OPTIONS = {
    mount: 'wrapper',
    frameIntervalMs: 100,
    sampleWidth: 96,
    canvasSize: 128,
    canvasBlur: 10,
    canvasBrightness: 1.04,
    canvasSaturate: 1.15,
    canvasOpacity: 0.42,
    glowStrength: 'subtle',
    clipToPlayer: true,
    bleedPadding: 10,
    bleedBlur: 10,
    glowBrightness: 1.06,
    glowSaturation: 1.12,
    glowOpacity: 0.45,
    scaleLandscapeX: 1.06,
    scaleLandscapeY: 1.08,
    scalePortraitX: 1.08,
    scalePortraitY: 1.06,
    scaleSquare: 1.07,
    useVideoFrameCallback: true,
};

export default function ambientModeModule(playerInstance) {
    let container = null;
    let fitEl = null;
    let canvasA = null;
    let canvasB = null;
    let sampleCanvas = null;
    let sampleCtx = null;
    let ctxA = null;
    let ctxB = null;
    let drawToA = true;
    let rafLoopId = null;
    let videoFrameId = null;
    let layoutFrameId = null;
    let resizeObserver = null;
    let lastFrameTime = 0;
    let corsBlocked = false;
    let samplingReady = false;
    let lastIntrinsicW = 0;
    let lastIntrinsicH = 0;
    let lastDisplayW = 0;
    let lastDisplayH = 0;

    const getVideo = () => playerInstance.domRef.player;
    const getWrapper = () => playerInstance.domRef.wrapper;

    const getOptions = () => {
        const userOptions = playerInstance.displayOptions?.layoutControls?.ambient || {};
        const preset = GLOW_PRESETS[userOptions.glowStrength] || {};
        const scaleMultiplier = preset.scaleMultiplier ?? 1;
        const resolved = {
            ...DEFAULT_OPTIONS,
            ...preset,
            ...userOptions,
        };

        if (!userOptions.scaleLandscapeX) {
            resolved.scaleLandscapeX = DEFAULT_OPTIONS.scaleLandscapeX * scaleMultiplier;
        }

        if (!userOptions.scaleLandscapeY) {
            resolved.scaleLandscapeY = DEFAULT_OPTIONS.scaleLandscapeY * scaleMultiplier;
        }

        if (!userOptions.scalePortraitX) {
            resolved.scalePortraitX = DEFAULT_OPTIONS.scalePortraitX * scaleMultiplier;
        }

        if (!userOptions.scalePortraitY) {
            resolved.scalePortraitY = DEFAULT_OPTIONS.scalePortraitY * scaleMultiplier;
        }

        if (!userOptions.scaleSquare) {
            resolved.scaleSquare = DEFAULT_OPTIONS.scaleSquare * scaleMultiplier;
        }

        delete resolved.scaleMultiplier;

        return resolved;
    };

    const isEnabled = () => !!playerInstance.getSettingsMenuStore?.()?.ambientMode;

    const getMountParent = () => {
        const wrapper = getWrapper();
        const { mount } = getOptions();

        if (!wrapper) {
            return null;
        }

        return mount === 'stage' ? (wrapper.parentElement || wrapper) : wrapper;
    };

    const getPositiveInt = (value, fallback) => {
        const parsed = Math.round(Number(value));
        return parsed > 0 ? parsed : fallback;
    };

    const isCrossOriginSource = () => {
        const sourceUrl = getVideo()?.currentSrc || getVideo()?.src;

        if (!sourceUrl) {
            return false;
        }

        try {
            return new URL(sourceUrl, window.location.href).origin !== window.location.origin;
        } catch (error) {
            return false;
        }
    };

    const canSample = () => {
        const video = getVideo();

        return !!(
            video
            && !corsBlocked
            && !playerInstance.isCurrentlyPlayingAd
            && video.readyState >= 1
            && video.videoWidth > 0
            && video.videoHeight > 0
        );
    };

    const resetSamplingState = () => {
        samplingReady = false;
        lastIntrinsicW = 0;
        lastIntrinsicH = 0;
        lastDisplayW = 0;
        lastDisplayH = 0;
    };

    const ensureCrossOrigin = () => {
        const video = getVideo();

        if (!video || !isCrossOriginSource() || video.crossOrigin === 'anonymous') {
            return false;
        }

        const resumeTime = video.currentTime;
        const shouldPlay = !video.paused && !video.ended;

        video.crossOrigin = 'anonymous';
        video.load();
        corsBlocked = false;
        resetSamplingState();

        const resume = () => {
            if (resumeTime > 0) {
                video.currentTime = resumeTime;
            }

            if (shouldPlay) {
                video.play().catch(() => {});
            }
        };

        if (video.readyState >= 1) {
            resume();
        } else {
            video.addEventListener('loadedmetadata', resume, { once: true });
        }

        return true;
    };

    const getSampleSize = (video) => {
        if (!video?.videoWidth || !video?.videoHeight) {
            return null;
        }

        const { sampleWidth: configured } = getOptions();
        const width = getPositiveInt(configured, DEFAULT_OPTIONS.sampleWidth);
        const height = Math.max(1, Math.round(width * (video.videoHeight / video.videoWidth)));

        return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
    };

    const getCanvasSize = () => getPositiveInt(getOptions().canvasSize, DEFAULT_OPTIONS.canvasSize);

    const applyScaleVars = (videoWidth, videoHeight) => {
        const wrapper = getWrapper();
        const opts = getOptions();
        const aspect = videoWidth / videoHeight;
        let scaleX;
        let scaleY;

        if (aspect < 1) {
            scaleX = opts.scalePortraitX;
            scaleY = opts.scalePortraitY;
        } else if (aspect > 1) {
            scaleX = opts.scaleLandscapeX;
            scaleY = opts.scaleLandscapeY;
        } else {
            scaleX = opts.scaleSquare;
            scaleY = opts.scaleSquare;
        }

        wrapper?.style.setProperty('--fp-ambient-scale-x', String(scaleX));
        wrapper?.style.setProperty('--fp-ambient-scale-y', String(scaleY));
    };

    const applyVisualConfig = () => {
        const wrapper = getWrapper();
        const opts = getOptions();
        const clipInsidePlayer = opts.clipToPlayer !== false;
        const bleedPadding = Math.max(0, Number(opts.bleedPadding) || 0);
        const bleedBlur = Math.max(0, Number(opts.bleedBlur) || 0);

        wrapper?.style.setProperty('--fp-ambient-bleed-blur', `${bleedBlur}px`);
        wrapper?.style.setProperty('--fp-ambient-brightness', String(opts.glowBrightness));
        wrapper?.style.setProperty('--fp-ambient-saturate', String(opts.glowSaturation));
        wrapper?.style.setProperty('--fp-ambient-opacity', String(opts.glowOpacity));
        wrapper?.style.setProperty('--fp-ambient-canvas-opacity', String(opts.canvasOpacity));
        wrapper?.style.setProperty('--fp-ambient-bleed-padding', `${bleedPadding}px`);

        wrapper?.classList.toggle('fp_ambient_clip', clipInsidePlayer);
        wrapper?.classList.toggle('fp_ambient_bleed', !clipInsidePlayer);
        container?.classList.toggle('fp_ambient_clip', clipInsidePlayer);
        container?.classList.toggle('fp_ambient_bleed', !clipInsidePlayer);
        getWrapper()?.parentElement?.classList.toggle('fp_ambient_stage_clip', clipInsidePlayer);
        getWrapper()?.parentElement?.classList.toggle('fp_ambient_stage_bleed', !clipInsidePlayer);
    };

    const syncFitBox = (force = false) => {
        const video = getVideo();
        const mountRoot = getMountParent();

        if (!fitEl || !video || !mountRoot) {
            return;
        }

        const rootRect = mountRoot.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        if (videoRect.width < 2 || videoRect.height < 2) {
            return;
        }

        const intrinsicChanged = video.videoWidth !== lastIntrinsicW || video.videoHeight !== lastIntrinsicH;
        const displayChanged = videoRect.width !== lastDisplayW || videoRect.height !== lastDisplayH;

        if (!force && !intrinsicChanged && !displayChanged) {
            return;
        }

        lastDisplayW = videoRect.width;
        lastDisplayH = videoRect.height;

        const bleedPadding = Math.max(0, Number(getOptions().bleedPadding) || 0);

        if (video.videoWidth > 0 && video.videoHeight > 0) {
            lastIntrinsicW = video.videoWidth;
            lastIntrinsicH = video.videoHeight;
            applyScaleVars(video.videoWidth, video.videoHeight);
        }

        fitEl.style.left = `${videoRect.left - rootRect.left - bleedPadding}px`;
        fitEl.style.top = `${videoRect.top - rootRect.top - bleedPadding}px`;
        fitEl.style.width = `${videoRect.width + bleedPadding * 2}px`;
        fitEl.style.height = `${videoRect.height + bleedPadding * 2}px`;
    };

    const scheduleAmbientUpdate = (forceLayout = false) => {
        if (layoutFrameId) {
            cancelAnimationFrame(layoutFrameId);
        }

        layoutFrameId = requestAnimationFrame(() => {
            layoutFrameId = null;

            if (!isEnabled()) {
                return;
            }

            syncFitBox(forceLayout);

            if (canSample()) {
                drawFrame();
            }
        });
    };

    const verifySampling = () => {
        if (corsBlocked || !canSample()) {
            samplingReady = false;
            return false;
        }

        if (samplingReady) {
            return true;
        }

        const video = getVideo();
        const size = getSampleSize(video);

        if (!size || !sampleCtx || !sampleCanvas) {
            return false;
        }

        try {
            sampleCanvas.width = size.width;
            sampleCanvas.height = size.height;
            sampleCtx.drawImage(video, 0, 0, size.width, size.height);
            sampleCtx.getImageData(0, 0, 1, 1);
            samplingReady = true;
            return true;
        } catch (error) {
            corsBlocked = true;
            samplingReady = false;
            return false;
        }
    };

    const swapCanvasVisibility = () => {
        if (!canvasA || !canvasB) {
            return;
        }

        canvasA.classList.toggle('fluid_ambient_canvas_visible', !drawToA);
        canvasB.classList.toggle('fluid_ambient_canvas_visible', drawToA);
    };

    const ensureContainer = () => {
        const wrapper = getWrapper();
        const mountParent = getMountParent();

        if (!wrapper || !mountParent || container) {
            return;
        }

        const { mount } = getOptions();
        const canvasSize = getCanvasSize();

        container = document.createElement('div');
        container.className = 'fluid_ambient_container';
        container.setAttribute('aria-hidden', 'true');

        if (mount === 'stage') {
            container.classList.add('fluid_ambient_container_stage');
        }

        fitEl = document.createElement('div');
        fitEl.className = 'fluid_ambient_fit';

        const glowEl = document.createElement('div');
        glowEl.className = 'fluid_ambient_glow';

        canvasA = document.createElement('canvas');
        canvasA.className = 'fluid_ambient_canvas fluid_ambient_canvas_a';
        canvasA.width = canvasSize;
        canvasA.height = canvasSize;

        canvasB = document.createElement('canvas');
        canvasB.className = 'fluid_ambient_canvas fluid_ambient_canvas_b fluid_ambient_canvas_visible';
        canvasB.width = canvasSize;
        canvasB.height = canvasSize;

        glowEl.append(canvasA, canvasB);
        fitEl.appendChild(glowEl);
        container.appendChild(fitEl);

        const insertBefore = mount === 'stage' ? wrapper : wrapper.firstChild;
        mountParent.insertBefore(container, insertBefore);

        sampleCanvas = document.createElement('canvas');
        sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        ctxA = canvasA.getContext('2d');
        ctxB = canvasB.getContext('2d');

        drawToA = true;
        swapCanvasVisibility();
    };

    const drawFrame = () => {
        if (!isEnabled() || !verifySampling()) {
            return false;
        }

        syncFitBox();

        const video = getVideo();
        const size = getSampleSize(video);
        const drawCtx = drawToA ? ctxA : ctxB;
        const { canvasBlur, canvasBrightness, canvasSaturate } = getOptions();
        const canvasSize = getCanvasSize();

        if (!video || !size || !drawCtx || !sampleCtx || !sampleCanvas) {
            return false;
        }

        try {
            sampleCanvas.width = size.width;
            sampleCanvas.height = size.height;
            sampleCtx.drawImage(video, 0, 0, size.width, size.height);

            drawCtx.clearRect(0, 0, canvasSize, canvasSize);
            drawCtx.filter = `blur(${canvasBlur}px) saturate(${canvasSaturate}) brightness(${canvasBrightness})`;
            drawCtx.drawImage(sampleCanvas, 0, 0, size.width, size.height, 0, 0, canvasSize, canvasSize);
            drawCtx.filter = 'none';

            drawToA = !drawToA;
            swapCanvasVisibility();
            return true;
        } catch (error) {
            samplingReady = false;
            corsBlocked = true;
            return false;
        }
    };

    const clearCanvases = () => {
        const size = getCanvasSize();
        ctxA?.clearRect(0, 0, size, size);
        ctxB?.clearRect(0, 0, size, size);
    };

    const cancelVideoFrameLoop = () => {
        const video = getVideo();

        if (videoFrameId !== null && typeof video?.cancelVideoFrameCallback === 'function') {
            video.cancelVideoFrameCallback(videoFrameId);
        }

        videoFrameId = null;
    };

    const startVideoFrameLoop = () => {
        const video = getVideo();
        const { useVideoFrameCallback } = getOptions();

        if (!video || !useVideoFrameCallback || typeof video.requestVideoFrameCallback !== 'function') {
            return false;
        }

        cancelVideoFrameLoop();

        const onFrame = () => {
            videoFrameId = null;

            if (!isEnabled()) {
                return;
            }

            drawFrame();

            if (!video.paused && !video.ended) {
                startVideoFrameLoop();
            }
        };

        videoFrameId = video.requestVideoFrameCallback(onFrame);
        return true;
    };

    const stopRafLoop = () => {
        if (rafLoopId) {
            cancelAnimationFrame(rafLoopId);
            rafLoopId = null;
        }
    };

    const rafLoop = (timestamp) => {
        rafLoopId = requestAnimationFrame(rafLoop);

        if (!isEnabled()) {
            return;
        }

        const { frameIntervalMs } = getOptions();

        if (timestamp - lastFrameTime < frameIntervalMs) {
            return;
        }

        lastFrameTime = timestamp;

        const video = getVideo();

        if (!video?.paused || playerInstance.isPlayingMedia) {
            drawFrame();
        }
    };

    const startRenderLoop = () => {
        if (startVideoFrameLoop()) {
            return;
        }

        if (rafLoopId) {
            return;
        }

        lastFrameTime = 0;
        rafLoopId = requestAnimationFrame(rafLoop);
    };

    const stopRenderLoop = () => {
        cancelVideoFrameLoop();
        stopRafLoop();
    };

    const setActive = (active) => {
        getWrapper()?.classList.toggle('fp_ambient_active', active);
        container?.classList.toggle('fp_ambient_active', active);
        getWrapper()?.parentElement?.classList.toggle('fp_ambient_stage_active', active);
    };

    const apply = (enabled) => {
        ensureContainer();

        if (enabled) {
            ensureCrossOrigin();
            setActive(true);
            applyVisualConfig();
            scheduleAmbientUpdate(true);
            startRenderLoop();
            drawFrame();
            return;
        }

        getWrapper()?.classList.remove('fp_ambient_clip', 'fp_ambient_bleed');
        container?.classList.remove('fp_ambient_clip', 'fp_ambient_bleed');
        getWrapper()?.parentElement?.classList.remove('fp_ambient_stage_clip', 'fp_ambient_stage_bleed');

        resetSamplingState();
        setActive(false);
        stopRenderLoop();
        clearCanvases();
    };

    const onVideoReady = () => {
        if (!isEnabled()) {
            return;
        }

        scheduleAmbientUpdate(true);
        startRenderLoop();
    };

    playerInstance.getAmbientModeStatus = () => ({
        enabled: isEnabled(),
        active: !!getWrapper()?.classList.contains('fp_ambient_active'),
        corsBlocked,
        canSample: canSample() && !corsBlocked,
        samplingReady,
        samplingVerified: samplingReady,
        crossOrigin: getVideo()?.crossOrigin || '',
    });

    playerInstance.setAmbientMode = (enabled) => {
        playerInstance.updateSettingsMenuStore?.({ ambientMode: !!enabled });
        apply(!!enabled);
    };

    playerInstance.initAmbientMode = () => {
        if (isEnabled()) {
            ensureCrossOrigin();
        }

        ensureContainer();

        const wrapper = getWrapper();
        const video = getVideo();

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => scheduleAmbientUpdate(true));

            if (wrapper) {
                resizeObserver.observe(wrapper);
            }

            if (video) {
                resizeObserver.observe(video);
            }
        }

        const onPlay = () => {
            drawFrame();
            startRenderLoop();
        };

        const onVideoResize = () => scheduleAmbientUpdate(true);

        const onVideoEmptied = () => {
            corsBlocked = false;
            resetSamplingState();
        };

        if (video) {
            video.addEventListener('loadedmetadata', onVideoReady);
            video.addEventListener('loadeddata', onVideoReady);
            video.addEventListener('resize', onVideoResize);
            video.addEventListener('seeked', drawFrame);
            video.addEventListener('play', onPlay);
            video.addEventListener('pause', cancelVideoFrameLoop);
            video.addEventListener('emptied', onVideoEmptied);
        }

        apply(isEnabled());

        playerInstance.destructors.push(() => {
            stopRenderLoop();

            if (layoutFrameId) {
                cancelAnimationFrame(layoutFrameId);
            }

            resizeObserver?.disconnect();
            setActive(false);
            clearCanvases();

            if (video) {
                video.removeEventListener('loadedmetadata', onVideoReady);
                video.removeEventListener('loadeddata', onVideoReady);
                video.removeEventListener('resize', onVideoResize);
                video.removeEventListener('seeked', drawFrame);
                video.removeEventListener('play', onPlay);
                video.removeEventListener('pause', cancelVideoFrameLoop);
                video.removeEventListener('emptied', onVideoEmptied);
            }
        });
    };

    const previousSettingsChange = playerInstance.onSettingsMenuChange;

    playerInstance.onSettingsMenuChange = (id, value) => {
        if (id === 'ambientMode') {
            apply(!!value);
        }

        previousSettingsChange?.(id, value);
    };
};
