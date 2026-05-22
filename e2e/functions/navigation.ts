import { Page } from '@playwright/test';

const WRAPPER_SELECTOR = '#fluid_video_wrapper_fluid-player-e2e-case';

/**
 * Pages that include the e2e-case player.
 * `/vod_basic.html` is always served by the dev server.
 * `/features_e2e.html` is only emitted in webpack `development` mode (not production serve).
 */
export const E2E_PLAYER_PAGES = ['/vod_basic.html', '/features_e2e.html'] as const;

export type E2ePlayerPage = (typeof E2E_PLAYER_PAGES)[number];

/**
 * Open a player test page and wait until Fluid Player has mounted.
 * Defaults to vod_basic.html (always emitted by the dev server).
 */
export async function gotoPlayerTestPage(
    page: Page,
    pagePath: string = process.env.FP_E2E_PLAYER_PAGE || '/vod_basic.html',
): Promise<void> {
    const response = await page.goto(pagePath, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
    });

    if (!response?.ok()) {
        throw new Error(
            `Failed to load ${pagePath} (${response?.status() ?? 'no response'}). `
            + 'Start the dev server with `pnpm start` (development mode). '
            + 'Use /vod_basic.html (default) or set FP_E2E_PLAYER_PAGE / FP_AMBIENT_E2E_PAGE.',
        );
    }

    await page.waitForSelector(WRAPPER_SELECTOR, { state: 'visible', timeout: 30_000 });

    await page.waitForFunction(() => {
        const win = window as Window & {
            fluidPlayerDebug?: unknown[];
        };

        return !!win.fluidPlayerDebug?.length;
    }, undefined, { timeout: 30_000 });

    await waitForPlayerIdle(page);
}

/** Wait until the VOD loader overlay is gone so controls are clickable. */
export async function waitForPlayerIdle(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const loader = document.querySelector('.vast_video_loading');

        if (!loader) {
            return true;
        }

        const style = window.getComputedStyle(loader);

        return style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0;
    }, undefined, { timeout: 20_000 }).catch(() => {});
}

/** Reload the player page and keep localStorage (persistence e2e). */
export async function reloadPlayerTestPage(page: Page): Promise<void> {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(WRAPPER_SELECTOR, { state: 'visible', timeout: 30_000 });

    await page.waitForFunction(() => {
        const win = window as Window & {
            fluidPlayerDebug?: unknown[];
        };

        return !!win.fluidPlayerDebug?.length;
    }, undefined, { timeout: 30_000 });

    await waitForPlayerIdle(page);
}

/** Clear storage and reload the player page (stable settings for e2e). */
export async function resetPlayerTestPage(page: Page, pagePath?: string): Promise<void> {
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(WRAPPER_SELECTOR, { state: 'visible', timeout: 30_000 });
    await waitForPlayerIdle(page);
}
