import { Locator, Page } from '@playwright/test';

const WRAPPER_SELECTOR = '#fluid_video_wrapper_fluid-player-e2e-case';

export type AmbientModeStatus = {
    enabled: boolean;
    active: boolean;
    corsBlocked: boolean;
    canSample: boolean;
    samplingReady: boolean;
    samplingVerified?: boolean;
    crossOrigin: string;
};

type PlayerInternals = {
    showControlBar?: (event?: { type: string }) => void;
    openSettingsMenu?: () => void;
    closeSettingsMenu?: (options?: { hideControls?: boolean }) => void;
    setAmbientMode?: (enabled: boolean) => void;
    getAmbientModeStatus?: () => AmbientModeStatus;
};

export function getWrapper(page: Page): Locator {
    return page.locator(WRAPPER_SELECTOR);
}

export async function getPlayerInternals(page: Page): Promise<PlayerInternals | null> {
    return page.evaluate(() => {
        const api = (window as Window & {
            fpFeaturesE2e?: { getInternals: () => PlayerInternals };
            fluidPlayerDebug?: { internals: PlayerInternals }[];
        }).fpFeaturesE2e;

        if (api?.getInternals) {
            return api.getInternals();
        }

        const debug = (window as Window & {
            fluidPlayerDebug?: { internals: PlayerInternals }[];
        }).fluidPlayerDebug;

        if (debug?.length) {
            return debug[debug.length - 1].internals;
        }

        return null;
    });
}

/** Dismiss the large initial play overlay so pointer events reach the player. */
export async function dismissInitialPlayOverlay(page: Page): Promise<void> {
    await page.evaluate(() => {
        const webpackOverlay = document.getElementById('webpack-dev-server-client-overlay');

        if (webpackOverlay?.parentElement instanceof HTMLElement) {
            webpackOverlay.parentElement.style.display = 'none';
        }
    });

    const wrapper = getWrapper(page);
    const initialPlay = wrapper.locator('.fluid_initial_play_button');

    if (await initialPlay.isVisible().catch(() => false)) {
        await initialPlay.click({ force: true });
        await page.waitForTimeout(300);
        return;
    }

    await page.evaluate(() => {
        const video = document.getElementById('fluid-player-e2e-case') as HTMLVideoElement | null;

        if (video && video.paused) {
            void video.play().catch(() => undefined);
        }
    });
}

/** Show the control bar (API first, then hover the wrapper — never the bare video element). */
export async function showControls(page: Page): Promise<void> {
    const internals = await getPlayerInternals(page);

    if (internals?.showControlBar) {
        await page.evaluate(() => {
            const api = (window as Window & {
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

            api?.showControlBar?.({ type: 'userActive' });
        });
        await page.waitForTimeout(300);
        return;
    }

    await dismissInitialPlayOverlay(page);

    const wrapper = getWrapper(page);
    const box = await wrapper.boundingBox();

    if (box) {
        await wrapper.hover({
            position: {
                x: Math.max(8, box.width * 0.5),
                y: Math.max(8, box.height - 24),
            },
        });
    } else {
        await wrapper.hover();
    }

    await page.waitForTimeout(400);
}

export async function hoverPlayerToShowControls(page: Page): Promise<void> {
    await showControls(page);
}

export async function isControlBarVisible(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const controlBar = document.querySelector('.fluid_controls_container');

        if (!controlBar) {
            return false;
        }

        const style = window.getComputedStyle(controlBar);

        if (style.display === 'none') {
            return false;
        }

        return style.opacity !== '0' && style.visibility !== 'hidden';
    });
}

export async function isSettingsMenuOpen(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const menu = document.querySelector('.fluid_settings_menu.fp_show');
        return !!menu;
    });
}

export async function openSettingsMenu(page: Page): Promise<void> {
    const internals = await getPlayerInternals(page);

    await page.waitForSelector('.fluid_settings_menu', { state: 'attached', timeout: 15_000 });

    if (internals?.openSettingsMenu) {
        await showControls(page);
        await page.evaluate(() => {
            const win = window as Window & {
                fpFeaturesE2e?: { getInternals: () => PlayerInternals };
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            };
            const api = win.fpFeaturesE2e?.getInternals?.()
                ?? win.fluidPlayerDebug?.slice(-1)[0]?.internals;

            api?.openSettingsMenu?.();
        });
    } else {
        await showControls(page);
        const settingsButton = getWrapper(page).locator('.fluid_control_video_source');
        await settingsButton.click({ timeout: 10_000, force: true });
    }

    await page.waitForSelector('.fluid_settings_menu.fp_show', { state: 'visible', timeout: 10_000 });
}

export async function closeSettingsMenu(page: Page): Promise<void> {
    const internals = await getPlayerInternals(page);

    if (internals?.closeSettingsMenu) {
        await page.evaluate(() => {
            const api = (window as Window & {
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

            api?.closeSettingsMenu?.();
        });
        return;
    }

    await getWrapper(page).locator('.fluid_control_video_source').click();
}

export async function getPseudoBackgroundImage(locator: Locator, pseudo: 'before' | 'after'): Promise<string> {
    return locator.evaluate((element, pseudoElement) => {
        return window.getComputedStyle(element, `::${pseudoElement}`).backgroundImage;
    }, pseudo);
}

/** Webpack inlines SVG assets as data URIs — decode for content checks. */
export function decodeSvgFromBackgroundImage(backgroundImage: string): string | null {
    const match = backgroundImage.match(/data:image\/svg\+xml;base64,([^)"']+)/);

    if (!match) {
        return null;
    }

    return Buffer.from(match[1], 'base64').toString('utf8');
}

/** Distinct path fragments from src/static/icons/*.svg (stable across bundling). */
export const THEATRE_ICON_MARKERS = {
    theatre: '7.86989',
    defaultViews: '16.8699',
} as const;

export const DOWNLOAD_ICON_MARKER = 'M12 2C11.7348';

export type TheatreIconLayers = {
    beforeOpacity: string;
    afterOpacity: string;
    beforeBackground: string;
    afterBackground: string;
};

export async function getTheatreIconLayers(theatreButton: Locator): Promise<TheatreIconLayers> {
    return theatreButton.evaluate((element) => {
        const before = window.getComputedStyle(element, '::before');
        const after = window.getComputedStyle(element, '::after');

        return {
            beforeOpacity: before.opacity,
            afterOpacity: after.opacity,
            beforeBackground: before.backgroundImage,
            afterBackground: after.backgroundImage,
        };
    });
}

/** Wait until crossfade finishes (CSS transition on ::before/::after). */
export async function waitForTheatreIconState(page: Page, active: boolean): Promise<void> {
    await page.waitForFunction((expectedActive) => {
        const button = document.querySelector('.fluid_control_theatre');

        if (!button) {
            return false;
        }

        const before = parseFloat(window.getComputedStyle(button, '::before').opacity);
        const after = parseFloat(window.getComputedStyle(button, '::after').opacity);

        if (expectedActive) {
            return before < 0.1 && after > 0.9;
        }

        return before > 0.9 && after < 0.1;
    }, active, { timeout: 3000 });
}

export function getAmbientContainer(page: Page): Locator {
    return page.locator('.fluid_ambient_container');
}

export async function getAmbientModeStatus(page: Page): Promise<AmbientModeStatus | null> {
    return page.evaluate(() => {
        const internals = (window as Window & {
            fpFeaturesE2e?: { getInternals: () => PlayerInternals };
            fluidPlayerDebug?: { internals: PlayerInternals }[];
        }).fpFeaturesE2e?.getInternals?.()
            ?? (window as Window & {
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

        return internals?.getAmbientModeStatus?.() ?? null;
    });
}

export async function setAmbientMode(page: Page, enabled: boolean): Promise<void> {
    await page.evaluate((on) => {
        const internals = (window as Window & {
            fpFeaturesE2e?: { getInternals: () => PlayerInternals };
            fluidPlayerDebug?: { internals: PlayerInternals }[];
        }).fpFeaturesE2e?.getInternals?.()
            ?? (window as Window & {
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

        internals?.setAmbientMode?.(on);
    }, enabled);
}

export async function isAmbientActive(page: Page): Promise<boolean> {
    const wrapper = getWrapper(page);
    return wrapper.evaluate((element) => element.classList.contains('fp_ambient_active'));
}

export async function toggleAmbientInSettings(page: Page): Promise<void> {
    const internals = await getPlayerInternals(page);

    await openSettingsMenu(page);
    await page.locator('[data-setting-key="ambientMode"] .fluid_settings_toggle').click({ force: true });

    if (internals?.closeSettingsMenu) {
        await page.evaluate(() => {
            const api = (window as Window & {
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

            api?.closeSettingsMenu?.({ hideControls: false });
        });
    }
}

export async function waitForAmbientActive(page: Page, active = true): Promise<void> {
    await page.waitForFunction((expectedActive) => {
        const wrapper = document.getElementById('fluid_video_wrapper_fluid-player-e2e-case');
        const container = document.querySelector('.fluid_ambient_container');

        if (!wrapper) {
            return false;
        }

        const wrapperActive = wrapper.classList.contains('fp_ambient_active');
        const containerActive = container?.classList.contains('fp_ambient_active') ?? false;

        return expectedActive ? wrapperActive && containerActive : !wrapperActive;
    }, active, { timeout: 5000 });
}

export async function waitForAmbientCanvasPaint(page: Page, timeout = 15_000): Promise<void> {
    await page.waitForFunction(() => {
        const canvases = document.querySelectorAll(
            '.fluid_ambient_container.fp_ambient_active .fluid_ambient_canvas',
        );

        for (const node of canvases) {
            const canvas = node as HTMLCanvasElement;
            const context = canvas.getContext('2d');

            if (!context || canvas.width < 1 || canvas.height < 1) {
                continue;
            }

            const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0 || data[i] + data[i + 1] + data[i + 2] > 0) {
                    return true;
                }
            }
        }

        return false;
    }, undefined, { timeout });
}

export async function waitForAmbientSampling(page: Page, timeout = 15_000): Promise<void> {
    await page.waitForFunction(() => {
        const internals = (window as Window & {
            fpFeaturesE2e?: { getInternals: () => PlayerInternals };
            fluidPlayerDebug?: { internals: PlayerInternals }[];
        }).fpFeaturesE2e?.getInternals?.()
            ?? (window as Window & {
                fluidPlayerDebug?: { internals: PlayerInternals }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

        const status = internals?.getAmbientModeStatus?.();

        return !!status?.active && !!status?.canSample && !!status?.samplingReady;
    }, undefined, { timeout });
}

export async function getAmbientGlowStyles(page: Page): Promise<{
    blur: string;
    brightness: string;
    saturate: string;
    scaleX: string;
    scaleY: string;
    containerOpacity: string;
}> {
    return page.evaluate(() => {
        const glow = document.querySelector('.fluid_ambient_container.fp_ambient_active .fluid_ambient_glow');
        const container = document.querySelector('.fluid_ambient_container.fp_ambient_active');
        const wrapper = document.getElementById('fluid_video_wrapper_fluid-player-e2e-case');

        if (!glow || !container || !wrapper) {
            return {
                blur: '',
                brightness: '',
                saturate: '',
                scaleX: '',
                scaleY: '',
                containerOpacity: '',
            };
        }

        const wrapperStyle = window.getComputedStyle(wrapper);

        return {
            blur: wrapperStyle.getPropertyValue('--fp-ambient-bleed-blur').trim(),
            brightness: wrapperStyle.getPropertyValue('--fp-ambient-brightness').trim(),
            saturate: wrapperStyle.getPropertyValue('--fp-ambient-saturate').trim(),
            scaleX: wrapperStyle.getPropertyValue('--fp-ambient-scale-x').trim(),
            scaleY: wrapperStyle.getPropertyValue('--fp-ambient-scale-y').trim(),
            containerOpacity: window.getComputedStyle(container).opacity,
        };
    });
}

export async function ensureTheatreModeOff(page: Page): Promise<void> {
    await page.evaluate(() => {
        const internals = (window as Window & {
            fluidPlayerDebug?: { internals: { theatreMode?: boolean; setTheatreMode?: (v: boolean) => void } }[];
        }).fluidPlayerDebug?.slice(-1)[0]?.internals;

        if (internals?.theatreMode && typeof internals.setTheatreMode === 'function') {
            internals.setTheatreMode(false);
        }
    });
}
