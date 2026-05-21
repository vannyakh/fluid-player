export default function ambientModeModule(playerInstance) {
    const FRAME_INTERVAL_MS = 100;
    const SAMPLE_WIDTH = 64;

    let ambientCanvas = null;
    let sampleCanvas = null;
    let sampleCtx = null;
    let ambientCtx = null;
    let animationFrameId = null;
    let lastFrameTime = 0;
    let resizeObserver = null;
    let corsBlocked = false;

    const isAmbientEnabled = () => !!playerInstance.getSettingsMenuStore?.()?.ambientMode;

    const canSampleVideo = () => {
        const video = playerInstance.domRef.player;

        return !!(
            video
            && !corsBlocked
            && !playerInstance.isCurrentlyPlayingAd
            && video.readyState >= 2
            && video.videoWidth > 0
            && video.videoHeight > 0
        );
    };

    const ensureCanvas = () => {
        const wrapper = playerInstance.domRef.wrapper;

        if (!wrapper || ambientCanvas) {
            return;
        }

        ambientCanvas = document.createElement('canvas');
        ambientCanvas.className = 'fluid_ambient_canvas';
        ambientCanvas.setAttribute('aria-hidden', 'true');
        wrapper.insertBefore(ambientCanvas, wrapper.firstChild);

        sampleCanvas = document.createElement('canvas');
        sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
        ambientCtx = ambientCanvas.getContext('2d');
    };

    const resizeCanvas = () => {
        if (!ambientCanvas || !playerInstance.domRef.wrapper) {
            return;
        }

        const { clientWidth, clientHeight } = playerInstance.domRef.wrapper;

        if (clientWidth > 0 && clientHeight > 0) {
            ambientCanvas.width = clientWidth;
            ambientCanvas.height = clientHeight;
        }
    };

    const drawAmbientFrame = () => {
        if (!isAmbientEnabled() || !ambientCanvas || !ambientCtx || !canSampleVideo()) {
            return;
        }

        const video = playerInstance.domRef.player;
        const sampleHeight = Math.max(1, Math.round(SAMPLE_WIDTH * (video.videoHeight / video.videoWidth)));

        sampleCanvas.width = SAMPLE_WIDTH;
        sampleCanvas.height = sampleHeight;

        try {
            sampleCtx.drawImage(video, 0, 0, SAMPLE_WIDTH, sampleHeight);
            ambientCtx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
            ambientCtx.filter = 'blur(42px) saturate(1.4)';
            ambientCtx.drawImage(sampleCanvas, 0, 0, ambientCanvas.width, ambientCanvas.height);
            ambientCtx.filter = 'none';
        } catch (error) {
            corsBlocked = true;
            playerInstance.setAmbientMode(false);
        }
    };

    const animationTick = (timestamp) => {
        animationFrameId = requestAnimationFrame(animationTick);

        if (!isAmbientEnabled()) {
            return;
        }

        if (timestamp - lastFrameTime < FRAME_INTERVAL_MS) {
            return;
        }

        lastFrameTime = timestamp;

        if (!playerInstance.domRef.player?.paused || playerInstance.isPlayingMedia) {
            drawAmbientFrame();
        }
    };

    const startAmbientLoop = () => {
        if (animationFrameId) {
            return;
        }

        lastFrameTime = 0;
        animationFrameId = requestAnimationFrame(animationTick);
    };

    const stopAmbientLoop = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    const setAmbientActiveClass = (active) => {
        playerInstance.domRef.wrapper?.classList.toggle('fp_ambient_active', active);
    };

    const applyAmbientMode = (enabled) => {
        ensureCanvas();
        resizeCanvas();

        if (enabled && !corsBlocked) {
            setAmbientActiveClass(true);
            drawAmbientFrame();
            startAmbientLoop();
            return;
        }

        setAmbientActiveClass(false);
        stopAmbientLoop();

        if (ambientCtx && ambientCanvas) {
            ambientCtx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
        }
    };

    playerInstance.setAmbientMode = (enabled) => {
        if (typeof playerInstance.updateSettingsMenuStore === 'function') {
            playerInstance.updateSettingsMenuStore({ ambientMode: !!enabled });
        }

        applyAmbientMode(!!enabled);
    };

    playerInstance.initAmbientMode = () => {
        ensureCanvas();
        resizeCanvas();

        if (playerInstance.domRef.wrapper && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                resizeCanvas();
                if (isAmbientEnabled()) {
                    drawAmbientFrame();
                }
            });
            resizeObserver.observe(playerInstance.domRef.wrapper);
        }

        const video = playerInstance.domRef.player;

        if (video) {
            video.addEventListener('loadeddata', drawAmbientFrame);
            video.addEventListener('seeked', drawAmbientFrame);
            video.addEventListener('play', drawAmbientFrame);
        }

        applyAmbientMode(isAmbientEnabled());

        playerInstance.destructors.push(() => {
            stopAmbientLoop();
            resizeObserver?.disconnect();
            setAmbientActiveClass(false);

            if (video) {
                video.removeEventListener('loadeddata', drawAmbientFrame);
                video.removeEventListener('seeked', drawAmbientFrame);
                video.removeEventListener('play', drawAmbientFrame);
            }
        });
    };

    const previousSettingsChange = playerInstance.onSettingsMenuChange;

    playerInstance.onSettingsMenuChange = (id, value) => {
        if (id === 'ambientMode') {
            applyAmbientMode(!!value);
        }

        if (typeof previousSettingsChange === 'function') {
            previousSettingsChange(id, value);
        }
    };
};
