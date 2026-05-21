import { displayModes } from '../constants/constants';
import {
    animateMiniPlayerEnter,
    animateMiniPlayerExit,
    animateMiniPlayerPlaceholder,
    animateMiniPlayerSnap,
} from './miniplayermotion';
import {
    createSnapGhost,
    findNearestSnapTarget,
    getSnapTargets,
    hideSnapGhost,
    removeSnapGhost,
    updateSnapGhost,
    DEFAULT_SNAP_MARGIN,
} from './miniplayerdrag';

const MINIMUM_WIDTH = 400;
const MINIMUM_HEIGHT = 225;
const MINIMUM_WIDTH_MOBILE = 40;
const TOGGLE_BY_VISIBILITY_DETECTION_RATE = 1000 / 60;

const DISABLE_MINI_PLAYER_MOBILE_ANIMATION_CLAMP = 50;
const DISABLE_MINI_PLAYER_MOBILE_ANIMATION_DEADZONE = 5;

const DESKTOP_ONLY_MEDIA_QUERY = '(max-width: 768px)';

const FLUID_PLAYER_WRAPPER_CLASS = 'fluid_mini_player_mode';
const MOUNTED_CLASS = 'fluid_mini_player_mode--mounted';
const CUSTOM_POSITION_CLASS = 'fluid_mini_player_mode--custom-position';
const MOUNT_HOST_CLASS = 'fluid_mini_player_mount_host';
const DRAGGING_CLASS = 'fluid_mini_player_dragging';
const CLOSE_BUTTON_WRAPPER_CLASS = 'mini-player-close-button-wrapper';
const CLOSE_BUTTON_CLASS = 'mini-player-close-button';
const PLACEHOLDER_CLASS = 'fluidplayer-miniplayer-player-placeholder';
const DISABLE_MINI_PLAYER_MOBILE_CLASS = 'disable-mini-player-mobile';

const POSITION_SUFFIXES = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

const LINEAR_CLICKTHROUGH_SELECTOR = '.vast_clickthrough_layer';
const NON_LINEAR_SELECTOR = '.fluid_nonLinear_ad img, .fluid_vpaid_nonlinear_slot_iframe';
const VPAID_FRAME_SELECTOR = '.fluid_vpaidNonLinear_frame';

const MINI_PLAYER_TOGGLE_EVENT = 'miniPlayerToggle';

const DRAG_ACTIVATION_DISTANCE = 6;

const DRAG_IGNORE_SELECTOR = [
    '.fluid_button',
    '.mini-player-close-button',
    '.mini-player-close-button-wrapper',
    '.fluid_controls_progress_container',
    '.fluid_timeline_preview_container',
    '.fluid_timeline_preview_container_shadow',
    'input',
    'a',
    'button',
    'select',
    'textarea',
].join(', ');

export default function miniPlayerModeModule(playerInstance) {
    let originalWidth = null;
    let originalHeight = null;
    let originalNonLinearWidth = null;
    let originalNonLinearHeight = null;
    let isSetup = false;
    let placeholderElement = null;
    let isMobile = false;
    let toggleByVisibilityControl = false;
    let originalParent = null;
    let originalNextSibling = null;
    let mountHost = null;
    let isGlobalFloat = false;
    let dragBindings = null;
    let snapGhostElement = null;
    let motionBusy = false;

    const getMiniPlayerOptions = () => {
        const options = playerInstance.displayOptions.layoutControls.miniPlayer || {};

        return {
            enabled: options.enabled !== false,
            width: options.width ?? 400,
            height: options.height ?? 225,
            widthMobile: options.widthMobile ?? 50,
            placeholderText: options.placeholderText ?? 'Playing in Miniplayer',
            position: options.position || 'bottom right',
            autoToggle: options.autoToggle === true,
            draggable: options.draggable !== false,
            floatToBody: options.floatToBody !== false,
            mountElement: options.mountElement || options.mountId || null,
            motion: options.motion !== false,
            dragSnap: options.dragSnap !== false,
            snapMargin: typeof options.snapMargin === 'number' ? options.snapMargin : DEFAULT_SNAP_MARGIN,
            onStateChange: options.onStateChange || options.onMiniPlayerChange || null,
        };
    };

    const clearMotionStyles = (element) => {
        if (!element) {
            return;
        }

        element.style.opacity = '';
        element.style.transform = '';
    };

    const resolveElement = (ref) => {
        if (!ref) {
            return null;
        }

        return document.getElementById(String(ref).replace(/^#/, ''));
    };

    const resolveMountHost = () => {
        const { mountElement } = getMiniPlayerOptions();

        return mountElement ? resolveElement(mountElement) : null;
    };

    const getPositionClass = (position) => (
        `${FLUID_PLAYER_WRAPPER_CLASS}--${position.trim().replace(/\s+/g, '-')}`
    );

    const removeMiniPlayerPositionClasses = (videoWrapper) => {
        POSITION_SUFFIXES.forEach((suffix) => {
            videoWrapper.classList.remove(`${FLUID_PLAYER_WRAPPER_CLASS}--${suffix}`);
        });
        videoWrapper.classList.remove(MOUNTED_CLASS, CUSTOM_POSITION_CLASS);
    };

    const clearMiniPlayerPositionStyles = (videoWrapper) => {
        ['left', 'top', 'right', 'bottom', 'transform', 'maxWidth'].forEach((key) => {
            videoWrapper.style[key] = '';
        });
    };

    const notifyMiniPlayerStateChange = (enabled) => {
        const options = getMiniPlayerOptions();

        playerInstance.domRef.player.dispatchEvent(
            new CustomEvent(MINI_PLAYER_TOGGLE_EVENT, { detail: { isToggledOn: enabled } }),
        );

        if (typeof options.onStateChange === 'function') {
            options.onStateChange({
                enabled,
                mountElement: options.mountElement || null,
                floating: enabled && !options.mountElement,
            });
        }
    };

    const extractSizeFromElement = (element, styleProperty, htmlProperty) => {
        if (styleProperty && element.style[styleProperty] && element.style[styleProperty].match('px')) {
            return parseInt(element.style[styleProperty], 10);
        }

        return String(element[htmlProperty]).match('px')
            ? parseInt(element[htmlProperty], 10)
            : element[htmlProperty];
    };

    const applyMiniPlayerDimensions = (videoWrapper, width, height, mobileWidth) => {
        const targetWidth = width > MINIMUM_WIDTH ? width : MINIMUM_WIDTH;
        const targetHeight = height > MINIMUM_HEIGHT ? height : MINIMUM_HEIGHT;
        const targetMobileWidth = mobileWidth > MINIMUM_WIDTH_MOBILE ? mobileWidth : MINIMUM_WIDTH_MOBILE;

        if (!isMobile) {
            videoWrapper.style.width = `${targetWidth}px`;
            videoWrapper.style.height = `${targetHeight}px`;
        } else {
            videoWrapper.style.width = `${targetMobileWidth}vw`;
            videoWrapper.style.height = 'auto';
            videoWrapper.style.aspectRatio = '16 / 9';
        }
    };

    const rememberOriginalSlot = (videoWrapper) => {
        originalParent = videoWrapper.parentElement;
        originalNextSibling = videoWrapper.nextSibling;
        originalWidth = extractSizeFromElement(videoWrapper, 'width', 'clientWidth');
        originalHeight = extractSizeFromElement(videoWrapper, 'height', 'clientHeight');
    };

    const createPlayerPlaceholder = (placeholderWidth, placeholderHeight) => {
        if (!originalParent) {
            return;
        }

        placeholderElement = document.createElement('div');
        placeholderElement.classList.add(PLACEHOLDER_CLASS);
        placeholderElement.style.height = `${placeholderHeight}px`;
        placeholderElement.style.width = `${placeholderWidth}px`;
        placeholderElement.innerText = getMiniPlayerOptions().placeholderText || '';
        placeholderElement.onclick = () => toggleMiniPlayer('off', true);

        originalParent.insertBefore(placeholderElement, originalNextSibling);

        animateMiniPlayerPlaceholder(placeholderElement, getMiniPlayerOptions().motion);
    };

    const removePlayerPlaceholder = () => {
        if (placeholderElement?.parentElement) {
            placeholderElement.parentElement.removeChild(placeholderElement);
        }

        placeholderElement = null;
    };

    const restoreWrapperToOriginalSlot = () => {
        const videoWrapper = playerInstance.domRef.wrapper;

        if (!originalParent) {
            return;
        }

        if (originalNextSibling) {
            originalParent.insertBefore(videoWrapper, originalNextSibling);
        } else {
            originalParent.appendChild(videoWrapper);
        }
    };

    const teardownFloatDrag = () => {
        if (!dragBindings) {
            return;
        }

        const { handle, onPointerDown, onPointerMove, onPointerUp } = dragBindings;

        handle.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);

        playerInstance.domRef.wrapper.classList.remove(DRAGGING_CLASS);
        removeSnapGhost(snapGhostElement);
        snapGhostElement = null;
        dragBindings = null;
    };

    const setupFloatDrag = (videoWrapper) => {
        const options = getMiniPlayerOptions();

        if (!options.draggable || isMobile) {
            return;
        }

        const dragHandle = videoWrapper;

        let dragPending = false;
        let dragActive = false;
        let dragPointerId = null;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOriginLeft = 0;
        let dragOriginTop = 0;
        let activeSnapTarget = null;

        const getWrapperSize = () => ({
            width: videoWrapper.offsetWidth,
            height: videoWrapper.offsetHeight,
        });

        const snapWrapperToPointerPosition = () => {
            const rect = videoWrapper.getBoundingClientRect();

            removeMiniPlayerPositionClasses(videoWrapper);
            videoWrapper.classList.add(CUSTOM_POSITION_CLASS);
            videoWrapper.style.left = `${rect.left}px`;
            videoWrapper.style.top = `${rect.top}px`;
            videoWrapper.style.right = 'auto';
            videoWrapper.style.bottom = 'auto';
        };

        const ensureSnapGhost = () => {
            if (!options.dragSnap) {
                return;
            }

            const { width, height } = getWrapperSize();

            if (!snapGhostElement) {
                snapGhostElement = createSnapGhost(width, height);
            } else {
                snapGhostElement.style.width = `${width}px`;
                snapGhostElement.style.height = `${height}px`;
            }
        };

        const updateSnapPreview = (left, top) => {
            if (!options.dragSnap || !snapGhostElement) {
                return;
            }

            const { width, height } = getWrapperSize();
            const targets = getSnapTargets(width, height, options.snapMargin);
            activeSnapTarget = findNearestSnapTarget(left, top, targets);
            updateSnapGhost(snapGhostElement, activeSnapTarget);
        };

        const clampDragPosition = (left, top) => {
            const { width, height } = getWrapperSize();
            const maxLeft = Math.max(0, window.innerWidth - width);
            const maxTop = Math.max(0, window.innerHeight - height);

            return {
                left: Math.min(Math.max(left, 0), maxLeft),
                top: Math.min(Math.max(top, 0), maxTop),
            };
        };

        const releaseDocumentDragListeners = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        };

        const finishDrag = () => {
            dragPending = false;
            dragActive = false;
            dragPointerId = null;
            videoWrapper.classList.remove(DRAGGING_CLASS);
            hideSnapGhost(snapGhostElement);
            releaseDocumentDragListeners();
        };

        const activateDrag = (event) => {
            if (dragActive) {
                return;
            }

            snapWrapperToPointerPosition();

            const rect = videoWrapper.getBoundingClientRect();

            dragActive = true;
            dragOriginLeft = rect.left;
            dragOriginTop = rect.top;

            ensureSnapGhost();
            updateSnapPreview(rect.left, rect.top);

            videoWrapper.classList.add(DRAGGING_CLASS);
            dragHandle.setPointerCapture?.(event.pointerId);
        };

        const onPointerMove = (event) => {
            if (event.pointerId !== dragPointerId || (!dragPending && !dragActive)) {
                return;
            }

            const deltaX = event.clientX - dragStartX;
            const deltaY = event.clientY - dragStartY;

            if (!dragActive) {
                if ((deltaX * deltaX) + (deltaY * deltaY) < DRAG_ACTIVATION_DISTANCE * DRAG_ACTIVATION_DISTANCE) {
                    return;
                }

                event.preventDefault();
                activateDrag(event);
            }

            const { left, top } = clampDragPosition(
                dragOriginLeft + event.clientX - dragStartX,
                dragOriginTop + event.clientY - dragStartY,
            );

            videoWrapper.style.left = `${left}px`;
            videoWrapper.style.top = `${top}px`;
            updateSnapPreview(left, top);
        };

        const onPointerUp = (event) => {
            if (event.pointerId !== dragPointerId || (!dragPending && !dragActive)) {
                return;
            }

            if (!dragActive) {
                finishDrag();
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const { left, top } = clampDragPosition(
                dragOriginLeft + event.clientX - dragStartX,
                dragOriginTop + event.clientY - dragStartY,
            );

            finishDrag();

            if (options.dragSnap && activeSnapTarget) {
                animateMiniPlayerSnap(
                    videoWrapper,
                    activeSnapTarget.left,
                    activeSnapTarget.top,
                    options.motion,
                );
            } else {
                videoWrapper.style.left = `${left}px`;
                videoWrapper.style.top = `${top}px`;
            }
        };

        const onPointerDown = (event) => {
            if (event.button !== 0 || event.target.closest(DRAG_IGNORE_SELECTOR)) {
                return;
            }

            const rect = videoWrapper.getBoundingClientRect();

            dragPending = true;
            dragPointerId = event.pointerId;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            dragOriginLeft = rect.left;
            dragOriginTop = rect.top;

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        };

        dragHandle.addEventListener('pointerdown', onPointerDown);

        dragBindings = {
            handle: dragHandle,
            onPointerDown,
            onPointerMove,
            onPointerUp,
        };
    };

    const enableGlobalFloat = (width, height, mobileWidth, position) => {
        const videoWrapper = playerInstance.domRef.wrapper;
        const options = getMiniPlayerOptions();

        rememberOriginalSlot(videoWrapper);
        createPlayerPlaceholder(originalWidth, originalHeight);

        if (options.floatToBody) {
            document.body.appendChild(videoWrapper);
            isGlobalFloat = true;
        }

        videoWrapper.classList.add(FLUID_PLAYER_WRAPPER_CLASS, getPositionClass(position));
        applyMiniPlayerDimensions(videoWrapper, width, height, mobileWidth);
        setupFloatDrag(videoWrapper);
    };

    const disableGlobalFloat = () => {
        teardownFloatDrag();

        const videoWrapper = playerInstance.domRef.wrapper;

        removeMiniPlayerPositionClasses(videoWrapper);
        clearMiniPlayerPositionStyles(videoWrapper);

        if (isGlobalFloat && videoWrapper.parentElement === document.body) {
            restoreWrapperToOriginalSlot();
        }

        isGlobalFloat = false;
        removePlayerPlaceholder();
        originalParent = null;
        originalNextSibling = null;
    };

    const mountWrapperToHost = (host, width, height, mobileWidth) => {
        const videoWrapper = playerInstance.domRef.wrapper;

        rememberOriginalSlot(videoWrapper);
        createPlayerPlaceholder(originalWidth, originalHeight);

        mountHost = host;
        host.classList.add(MOUNT_HOST_CLASS);

        while (host.firstChild) {
            host.removeChild(host.firstChild);
        }

        host.appendChild(videoWrapper);

        videoWrapper.classList.add(FLUID_PLAYER_WRAPPER_CLASS, MOUNTED_CLASS);
        applyMiniPlayerDimensions(videoWrapper, width, height, mobileWidth);

        if (isMobile) {
            videoWrapper.style.width = '100%';
            videoWrapper.style.maxWidth = '100%';
        }
    };

    const restoreWrapperFromHost = () => {
        const videoWrapper = playerInstance.domRef.wrapper;

        videoWrapper.classList.remove(MOUNTED_CLASS);

        if (mountHost) {
            mountHost.classList.remove(MOUNT_HOST_CLASS);
        }

        restoreWrapperToOriginalSlot();
        removePlayerPlaceholder();

        mountHost = null;
        originalParent = null;
        originalNextSibling = null;
    };

    const setupMiniPlayer = () => {
        const wrapper = playerInstance.domRef.wrapper;
        const hasCloseButton = Boolean(wrapper.querySelector(`.${CLOSE_BUTTON_CLASS}`));

        if (!hasCloseButton) {
            const closeButtonWrapper = document.createElement('div');
            closeButtonWrapper.classList.add(CLOSE_BUTTON_WRAPPER_CLASS);

            const closeButton = document.createElement('span');
            closeButton.classList.add(CLOSE_BUTTON_CLASS);
            closeButton.addEventListener('click', () => {
                toggleMiniPlayer('off', true);

                if (!playerInstance.domRef.player.paused) {
                    playerInstance.playPauseToggle();
                }
            });

            closeButtonWrapper.appendChild(closeButton);
            wrapper.appendChild(closeButtonWrapper);
        }

        if (isMobile) {
            setupMobile();
        }

        isSetup = true;
    };

    const toggleMiniPlayerOff = () => {
        const videoWrapper = playerInstance.domRef.wrapper;
        const wasMounted = videoWrapper.classList.contains(MOUNTED_CLASS);

        if (wasMounted) {
            restoreWrapperFromHost();
        } else {
            disableGlobalFloat();
        }

        videoWrapper.classList.remove(FLUID_PLAYER_WRAPPER_CLASS);
        removeMiniPlayerPositionClasses(videoWrapper);
        clearMiniPlayerPositionStyles(videoWrapper);
        clearMotionStyles(videoWrapper);

        if (originalWidth !== null) {
            videoWrapper.style.width = `${originalWidth}px`;
            videoWrapper.style.height = `${originalHeight}px`;
        }

        originalWidth = null;
        originalHeight = null;

        adaptNonLinearSize();
        adaptLinearSize();
        playerInstance.miniPlayerToggledOn = false;
        notifyMiniPlayerStateChange(false);
    };

    const toggleMiniPlayerOn = (width, height, mobileWidth, position) => {
        const videoWrapper = playerInstance.domRef.wrapper;

        playerInstance.closeSettingsMenu?.();

        if (playerInstance.theatreMode) {
            playerInstance.setTheatreMode?.(false);
        }

        const host = resolveMountHost();

        if (host) {
            mountWrapperToHost(host, width, height, mobileWidth);
        } else {
            enableGlobalFloat(width, height, mobileWidth, position);
        }

        adaptNonLinearSize(width, height, mobileWidth);
        adaptLinearSize();
        playerInstance.miniPlayerToggledOn = true;
        notifyMiniPlayerStateChange(true);

        animateMiniPlayerEnter(videoWrapper, position, getMiniPlayerOptions().motion);
    };

    const adaptNonLinearSize = (width, height, mobileWidth) => {
        const nonLinear = playerInstance.domRef.wrapper.querySelector(NON_LINEAR_SELECTOR);
        const vpaidFrame = playerInstance.domRef.wrapper.querySelector(VPAID_FRAME_SELECTOR);

        if (!nonLinear) {
            return;
        }

        let targetWidth = width;

        if (isMobile && mobileWidth) {
            targetWidth = (window.innerWidth * mobileWidth) / 100;
        }

        const nonLinearWidth = extractSizeFromElement(nonLinear, null, 'width');
        const nonLinearHeight = extractSizeFromElement(nonLinear, null, 'height');

        if (originalNonLinearWidth && originalNonLinearHeight) {
            nonLinear.width = originalNonLinearWidth;
            nonLinear.height = originalNonLinearHeight;

            if (vpaidFrame) {
                vpaidFrame.style.width = `${originalNonLinearWidth}px`;
                vpaidFrame.style.height = `${originalNonLinearHeight}px`;
            }

            originalNonLinearWidth = originalNonLinearHeight = null;
        } else if (targetWidth && targetWidth > 0 && (nonLinearWidth > targetWidth || nonLinearHeight > height)) {
            const targetRatio = (targetWidth - (isMobile ? 4 : 32)) / nonLinearWidth;

            originalNonLinearWidth = nonLinearWidth;
            originalNonLinearHeight = nonLinearHeight;

            nonLinear.width = Math.round(nonLinearWidth * targetRatio);
            nonLinear.height = Math.round(nonLinearHeight * targetRatio);

            if (vpaidFrame) {
                vpaidFrame.style.width = `${Math.round(nonLinearWidth * targetRatio)}px`;
                vpaidFrame.style.height = `${Math.round(nonLinearHeight * targetRatio)}px`;
            }
        }
    };

    const adaptLinearSize = () => {
        const clickTroughLayer = playerInstance.domRef.wrapper.querySelector(LINEAR_CLICKTHROUGH_SELECTOR);

        if (clickTroughLayer) {
            clickTroughLayer.style.width = `${playerInstance.domRef.player.offsetWidth}px`;
            clickTroughLayer.style.height = `${playerInstance.domRef.player.offsetHeight}px`;
        }
    };

    const setupMobile = () => {
        const disableMiniPlayerMobile = document.createElement('div');
        let animationAmount = 0;
        let startScreenX = 0;
        let hasTriggeredAnimation;
        disableMiniPlayerMobile.classList.add(DISABLE_MINI_PLAYER_MOBILE_CLASS);
        const closeButton = document.createElement('span');
        closeButton.classList.add(CLOSE_BUTTON_CLASS);
        disableMiniPlayerMobile.appendChild(closeButton);

        disableMiniPlayerMobile.ontouchstart = (event) => {
            hasTriggeredAnimation = false;
            startScreenX = event.changedTouches[0].screenX;
            event.preventDefault();
        };

        disableMiniPlayerMobile.ontouchmove = (event) => {
            animationAmount = Math.min(
                Math.max(
                    startScreenX - event.changedTouches[0].screenX,
                    DISABLE_MINI_PLAYER_MOBILE_ANIMATION_CLAMP * -1,
                ),
                DISABLE_MINI_PLAYER_MOBILE_ANIMATION_CLAMP,
            );

            if (Math.abs(animationAmount) > DISABLE_MINI_PLAYER_MOBILE_ANIMATION_DEADZONE) {
                playerInstance.domRef.wrapper.style.transform = `translateX(${animationAmount * -1}px)`;
                hasTriggeredAnimation = true;
            } else {
                playerInstance.domRef.wrapper.style.transform = 'translateX(0px)';
            }
        };

        disableMiniPlayerMobile.ontouchend = (event) => {
            if (Math.abs(animationAmount) > DISABLE_MINI_PLAYER_MOBILE_ANIMATION_DEADZONE) {
                toggleMiniPlayer('off', true);

                if (!playerInstance.domRef.player.paused) {
                    playerInstance.playPauseToggle();
                }

                event.preventDefault();
            } else if (!hasTriggeredAnimation) {
                toggleMiniPlayer('off', true);
                setTimeout(() => {
                    playerInstance.domRef.wrapper.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                }, 0);
            }

            animationAmount = 0;
            playerInstance.domRef.wrapper.style.transform = '';
        };

        disableMiniPlayerMobile.onmouseup = () => toggleMiniPlayer('off', true);

        playerInstance.domRef.wrapper.insertBefore(disableMiniPlayerMobile, playerInstance.domRef.player.nextSibling);
    };

    const toggleScreenDetection = () => {
        const autoToggle = getMiniPlayerOptions().autoToggle;

        if (toggleByVisibilityControl || !autoToggle) {
            document.removeEventListener('scroll', toggleMiniPlayerByVisibility);
            toggleByVisibilityControl = false;
            return;
        }

        toggleByVisibilityControl = true;
        document.addEventListener('scroll', toggleMiniPlayerByVisibility, { passive: true });
    };

    const toggleMiniPlayerByVisibility = playerInstance.throttle(function toggleMiniPlayerByVisibility() {
        if (playerInstance.domRef.player.paused) {
            return;
        }

        const isPlayerVisible = playerInstance.isElementVisible(playerInstance.domRef.player);
        const isPlaceholderVisible = placeholderElement
            && playerInstance.isElementVisible(placeholderElement);

        if (!isPlayerVisible && !playerInstance.miniPlayerToggledOn) {
            toggleMiniPlayer('on');
        } else if (isPlaceholderVisible && playerInstance.miniPlayerToggledOn) {
            toggleMiniPlayer('off');
        }
    }, TOGGLE_BY_VISIBILITY_DETECTION_RATE);

    const toggleMiniPlayer = (forceToggle, manualToggle = false, toAnotherDisplayTarget = false) => {
        playerInstance.debugMessage?.(`[MiniPlayer] Toggling MiniPlayer, forceToggle: ${forceToggle}`);

        const options = getMiniPlayerOptions();

        if (!options.enabled || playerInstance.isInIframe) {
            return;
        }

        if (
            (forceToggle === 'on' && playerInstance.miniPlayerToggledOn)
            || (forceToggle === 'off' && !playerInstance.miniPlayerToggledOn)
        ) {
            return;
        }

        if (manualToggle) {
            toggleScreenDetection();
        }

        isMobile = window.matchMedia(DESKTOP_ONLY_MEDIA_QUERY).matches;

        const previousDisplayMode = playerInstance.getPreviousDisplayMode();
        playerInstance.resetDisplayMode(displayModes.MINI_PLAYER);

        if (!isSetup) {
            setupMiniPlayer();
        }

        if (forceToggle === 'off' || playerInstance.miniPlayerToggledOn) {
            const wrapper = playerInstance.domRef.wrapper;

            if (options.motion && playerInstance.miniPlayerToggledOn && !motionBusy) {
                motionBusy = true;
                animateMiniPlayerExit(wrapper, options.motion)
                    .finally(() => {
                        motionBusy = false;
                        toggleMiniPlayerOff();
                    });
            } else {
                toggleMiniPlayerOff();
            }
        } else {
            toggleMiniPlayerOn(options.width, options.height, options.widthMobile, options.position);
        }

        if (!toAnotherDisplayTarget) {
            playerInstance.trackPlayerSizeChanged?.(previousDisplayMode);
        }

        window.dispatchEvent(new Event('resize'));
    };

    playerInstance.getMiniPlayerOptions = getMiniPlayerOptions;

    playerInstance.isMiniPlayerEnabled = () => getMiniPlayerOptions().enabled;

    playerInstance.toggleMiniPlayer = toggleMiniPlayer;

    playerInstance.setMiniPlayer = (enabled) => {
        const shouldEnable = !!enabled;

        if (shouldEnable === !!playerInstance.miniPlayerToggledOn) {
            return;
        }

        toggleMiniPlayer(shouldEnable ? 'on' : 'off', true);
    };

    playerInstance.toggleMiniPlayerScreenDetection = toggleScreenDetection;

    playerInstance.initMiniPlayer = () => {
        const options = getMiniPlayerOptions();
        const miniPlayerButton = playerInstance.domRef.wrapper?.querySelector('.fluid_control_mini_player');

        if (!miniPlayerButton) {
            return;
        }

        if (options.enabled && !playerInstance.isInIframe) {
            miniPlayerButton.style.display = 'inline-block';
            playerInstance.trackEvent(
                playerInstance.domRef.player.parentNode,
                'click',
                '.fluid_control_mini_player',
                () => toggleMiniPlayer(undefined, true),
            );
        } else {
            miniPlayerButton.style.display = 'none';
        }
    };

    playerInstance.destructors.push(() => {
        document.removeEventListener('scroll', toggleMiniPlayerByVisibility);

        if (playerInstance.miniPlayerToggledOn) {
            toggleMiniPlayer('off', false, true);
        }
    });
};
