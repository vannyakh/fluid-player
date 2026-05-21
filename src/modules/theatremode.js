import { displayModes } from '../constants/constants';

const WRAPPER_STYLE_KEYS = [
    'width',
    'height',
    'maxHeight',
    'maxWidth',
    'marginTop',
    'marginLeft',
    'marginRight',
    'left',
    'right',
    'position',
];

const LAYOUT_STYLE_KEYS = [
    'display',
    'gridTemplateColumns',
    'width',
    'maxWidth',
    'gap',
];

const PAGE_STYLE_KEYS = [
    'width',
    'maxWidth',
    'paddingLeft',
    'paddingRight',
];

export default function theatreModeModule(playerInstance) {
    let wrapperStyleSnapshot = null;
    let parentStyleSnapshot = null;
    let layoutStyleSnapshot = null;
    let pageStyleSnapshot = null;
    let layoutHost = null;
    let pageHost = null;
    let sidebarHost = null;
    let parentHost = null;
    let resizeFrameId = null;
    let theatreResizeBound = false;

    const getTheatreOptions = () => {
        const layout = playerInstance.displayOptions.layoutControls || {};
        const mode = layout.theatreMode || {};
        const legacyAdvanced = layout.theatreAdvanced || {};
        const legacySettings = layout.theatreSettings || {};

        const parentElement = mode.parentElement
            || mode.parentId
            || legacyAdvanced.theatreElement
            || null;

        return {
            enabled: layout.allowTheatre !== false && mode.enabled !== false,
            expandPage: mode.expandPage !== false,
            parentElement,
            pageElement: mode.pageElement || mode.pageId || null,
            layoutElement: mode.layoutElement || mode.layoutId || null,
            sidebarElement: mode.sidebarElement || mode.sidebarId || null,
            classToApply: mode.classToApply || legacyAdvanced.classToApply || null,
            width: mode.width || legacySettings.width || '100%',
            height: mode.height || legacySettings.height || 'auto',
            marginTop: mode.marginTop ?? legacySettings.marginTop ?? 0,
            horizontalAlign: mode.horizontalAlign || legacySettings.horizontalAlign || 'center',
            onStateChange: mode.onStateChange || mode.onTheatreModeChange || null,
        };
    };

    const resolveElement = (ref) => {
        if (!ref) {
            return null;
        }

        const id = String(ref).replace(/^#/, '');

        return document.getElementById(id);
    };

    const resolveTheatreHosts = () => {
        const options = getTheatreOptions();
        const wrapper = playerInstance.domRef.wrapper;

        parentHost = resolveElement(options.parentElement)
            || wrapper?.parentElement
            || null;

        layoutHost = resolveElement(options.layoutElement)
            || wrapper?.closest('[data-fluid-theatre-layout]')
            || parentHost?.closest('[data-fluid-theatre-layout]')
            || null;

        pageHost = resolveElement(options.pageElement)
            || layoutHost?.closest('[data-fluid-theatre-page]')
            || layoutHost?.parentElement
            || null;

        sidebarHost = resolveElement(options.sidebarElement)
            || layoutHost?.querySelector('[data-fluid-theatre-sidebar]')
            || null;

        return { parentHost, layoutHost, pageHost, sidebarHost };
    };

    const captureInlineStyles = (element, keys) => {
        const snapshot = {};

        keys.forEach((key) => {
            snapshot[key] = element.style[key] || '';
        });

        return snapshot;
    };

    const restoreInlineStyles = (element, snapshot) => {
        if (!element || !snapshot) {
            return;
        }

        Object.keys(snapshot).forEach((key) => {
            element.style[key] = snapshot[key];
        });
    };

    const applyWrapperTheatreLayout = (enable) => {
        const wrapper = playerInstance.domRef.wrapper;
        const options = getTheatreOptions();

        if (!wrapper) {
            return;
        }

        if (!enable) {
            wrapper.classList.remove('fluid_theatre_mode');
            restoreInlineStyles(wrapper, wrapperStyleSnapshot);
            wrapperStyleSnapshot = null;
            return;
        }

        if (!wrapperStyleSnapshot) {
            wrapperStyleSnapshot = captureInlineStyles(wrapper, WRAPPER_STYLE_KEYS);
        }

        wrapper.classList.add('fluid_theatre_mode');
        wrapper.style.position = 'absolute';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.right = '0';
        wrapper.style.bottom = '0';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.maxWidth = '100%';
        wrapper.style.maxHeight = 'none';
        wrapper.style.marginTop = '0';
        wrapper.style.marginLeft = '0';
        wrapper.style.marginRight = '0';
    };

    const applyParentTheatreLayout = (enable) => {
        const options = getTheatreOptions();
        const { parentHost: parent } = resolveTheatreHosts();

        if (!parent) {
            applyWrapperTheatreLayout(enable);
            return;
        }

        if (!enable) {
            if (options.classToApply) {
                parent.classList.remove(options.classToApply);
            }

            parent.classList.remove('fluid_theatre_stage_active');
            parent.classList.remove('fluid_theatre_parent_active');
            parent.style.aspectRatio = '';
            parent.style.height = '';
            parent.style.maxHeight = '';
            restoreInlineStyles(parent, parentStyleSnapshot);
            parentStyleSnapshot = null;
            applyWrapperTheatreLayout(false);
            return;
        }

        if (!parentStyleSnapshot) {
            parentStyleSnapshot = captureInlineStyles(parent, [
                'width',
                'maxWidth',
                'height',
                'marginTop',
                'marginLeft',
                'marginRight',
                'aspectRatio',
            ]);
        }

        if (options.classToApply) {
            parent.classList.add(options.classToApply);
        }

        parent.classList.add('fluid_theatre_stage_active');
        parent.classList.add('fluid_theatre_parent_active');
        parent.style.width = options.expandPage ? '100%' : String(options.width);
        parent.style.maxWidth = '100%';
        parent.style.height = options.height === 'auto' ? 'auto' : options.height;
        parent.style.aspectRatio = '16 / 9';
        parent.style.marginTop = `${options.marginTop}px`;
        parent.style.marginLeft = 'auto';
        parent.style.marginRight = 'auto';

        applyWrapperTheatreLayout(true);
    };

    const applyPageTheatreLayout = (enable) => {
        const options = getTheatreOptions();

        if (!options.expandPage) {
            return;
        }

        const { layoutHost: layout, pageHost: page, sidebarHost: sidebar } = resolveTheatreHosts();

        if (!enable) {
            document.body.classList.remove('fluid_theatre_body_active');
            layout?.classList.remove('fluid_theatre_layout_active');
            page?.classList.remove('fluid_theatre_page_active');
            sidebar?.classList.remove('fluid_theatre_sidebar_hidden');
            restoreInlineStyles(layout, layoutStyleSnapshot);
            restoreInlineStyles(page, pageStyleSnapshot);
            layoutStyleSnapshot = null;
            pageStyleSnapshot = null;
            return;
        }

        document.body.classList.add('fluid_theatre_body_active');

        if (page) {
            if (!pageStyleSnapshot) {
                pageStyleSnapshot = captureInlineStyles(page, PAGE_STYLE_KEYS);
            }

            page.classList.add('fluid_theatre_page_active');
            page.style.width = '100%';
            page.style.maxWidth = '100%';
            page.style.paddingLeft = '0';
            page.style.paddingRight = '0';
        }

        if (layout) {
            if (!layoutStyleSnapshot) {
                layoutStyleSnapshot = captureInlineStyles(layout, LAYOUT_STYLE_KEYS);
            }

            layout.classList.add('fluid_theatre_layout_active');
            layout.style.display = 'grid';
            layout.style.gridTemplateColumns = '1fr';
            layout.style.width = '100%';
            layout.style.maxWidth = '100%';
            layout.style.gap = '0';
        }

        if (sidebar) {
            sidebar.classList.add('fluid_theatre_sidebar_hidden');
        }
    };

    const syncTheatreResponsiveLayout = () => {
        if (!playerInstance.theatreMode) {
            return;
        }

        const { parentHost: parent } = resolveTheatreHosts();

        if (!parent) {
            playerInstance.resizeVpaidAuto?.();
            return;
        }

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const isLandscapeMobile = window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;

        if (isLandscapeMobile) {
            parent.style.height = '100vh';
            parent.style.maxHeight = '100vh';
            parent.style.aspectRatio = 'auto';
        } else {
            parent.style.aspectRatio = '16 / 9';
            parent.style.height = 'auto';
            parent.style.maxHeight = '';

            if (viewportWidth > 0 && viewportWidth <= 768) {
                const heightCap = Math.min((viewportWidth * 9) / 16, window.innerHeight * 0.75);
                parent.style.maxHeight = `${Math.round(heightCap)}px`;
            }
        }

        playerInstance.resizeVpaidAuto?.();
    };

    const handleTheatreResize = () => {
        if (!playerInstance.theatreMode) {
            return;
        }

        if (resizeFrameId) {
            cancelAnimationFrame(resizeFrameId);
        }

        resizeFrameId = requestAnimationFrame(() => {
            resizeFrameId = null;
            syncTheatreResponsiveLayout();
        });
    };

    const bindTheatreResizeListeners = () => {
        if (theatreResizeBound) {
            return;
        }

        theatreResizeBound = true;
        window.addEventListener('resize', handleTheatreResize);
        window.addEventListener('orientationchange', handleTheatreResize);
    };

    const unbindTheatreResizeListeners = () => {
        if (!theatreResizeBound) {
            return;
        }

        theatreResizeBound = false;
        window.removeEventListener('resize', handleTheatreResize);
        window.removeEventListener('orientationchange', handleTheatreResize);

        if (resizeFrameId) {
            cancelAnimationFrame(resizeFrameId);
            resizeFrameId = null;
        }
    };

    const notifyTheatreStateChange = (enabled) => {
        const options = getTheatreOptions();
        const eventName = enabled ? 'theatreModeOn' : 'theatreModeOff';

        playerInstance.domRef.player.dispatchEvent(new CustomEvent(eventName, {
            bubbles: false,
            cancelable: true,
        }));

        if (typeof options.onStateChange === 'function') {
            options.onStateChange({
                enabled,
                parentElement: options.parentElement || null,
                layoutElement: options.layoutElement || null,
                pageElement: options.pageElement || null,
            });
        }
    };

    playerInstance.getTheatreModeOptions = getTheatreOptions;

    playerInstance.isTheatreModeEnabled = () => getTheatreOptions().enabled;

    playerInstance.theatreToggle = (toAnotherDisplayTarget = false) => {
        if (playerInstance.isInIframe || !getTheatreOptions().enabled) {
            return;
        }

        playerInstance.debugMessage?.('Toggling theatre mode');

        const previousDisplayMode = playerInstance.getPreviousDisplayMode();
        playerInstance.resetDisplayMode(displayModes.THEATER);

        const enabling = !playerInstance.theatreMode;

        applyPageTheatreLayout(enabling);
        applyParentTheatreLayout(enabling);

        playerInstance.theatreMode = enabling;
        playerInstance.theatreModeAdvanced = !!getTheatreOptions().expandPage;
        playerInstance.fluidStorage.fluidTheatre = enabling;

        notifyTheatreStateChange(enabling);

        if (!toAnotherDisplayTarget) {
            playerInstance.trackPlayerSizeChanged?.(previousDisplayMode);
        }

        playerInstance.resizeVpaidAuto?.();

        if (enabling) {
            bindTheatreResizeListeners();
            syncTheatreResponsiveLayout();
        } else {
            unbindTheatreResizeListeners();
        }

        window.dispatchEvent(new Event('resize'));
    };

    playerInstance.setTheatreMode = (enabled) => {
        const shouldEnable = !!enabled;

        if (shouldEnable === !!playerInstance.theatreMode) {
            return;
        }

        playerInstance.theatreToggle();
    };

    playerInstance.initTheatreMode = () => {
        const options = getTheatreOptions();
        const theatreButton = playerInstance.domRef.wrapper?.querySelector('.fluid_control_theatre');

        if (!theatreButton) {
            return;
        }

        if (options.enabled && !playerInstance.isInIframe) {
            theatreButton.style.display = 'inline-block';
            playerInstance.trackEvent(
                playerInstance.domRef.player.parentNode,
                'click',
                '.fluid_control_theatre',
                () => playerInstance.theatreToggle(),
            );
        } else {
            theatreButton.style.display = 'none';
        }
    };

    playerInstance.restoreTheatreFromStorage = () => {
        if (
            typeof playerInstance.fluidStorage?.fluidTheatre !== 'undefined'
            && playerInstance.fluidStorage.fluidTheatre === 'true'
            && playerInstance.displayOptions.layoutControls.persistentSettings?.theatre !== false
            && getTheatreOptions().enabled
        ) {
            playerInstance.theatreToggle();
        }
    };

    playerInstance.destructors.push(() => {
        unbindTheatreResizeListeners();
    });
};
