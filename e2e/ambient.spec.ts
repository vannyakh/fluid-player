import { test, expect } from '@playwright/test';
import {
    getWrapper,
    dismissInitialPlayOverlay,
    openSettingsMenu,
    getAmbientContainer,
    getAmbientModeStatus,
    setAmbientMode,
    toggleAmbientInSettings,
    waitForAmbientActive,
    waitForAmbientSampling,
    waitForAmbientCanvasPaint,
    getAmbientGlowStyles,
} from './functions/player';
import {
    gotoPlayerTestPage,
    reloadPlayerTestPage,
    resetPlayerTestPage,
    waitForPlayerIdle,
} from './functions/navigation';
import { ensureMainVideoMetadata, useReliableE2eVideoSource } from './functions/video';

test.describe('ambient mode', () => {
    test.describe.configure({ timeout: 60_000, mode: 'serial' });

    test.beforeEach(async ({ page }) => {
        await gotoPlayerTestPage(page, process.env.FP_AMBIENT_E2E_PAGE);
        await resetPlayerTestPage(page);
        await dismissInitialPlayOverlay(page);
    });

    test('settings menu toggle enables and disables ambient layer', async ({ page }) => {
        const wrapper = getWrapper(page);

        await expect(wrapper).not.toHaveClass(/fp_ambient_active/);

        await toggleAmbientInSettings(page);
        await waitForAmbientActive(page, true);

        await setAmbientMode(page, false);
        await waitForAmbientActive(page, false);
    });

    test('setAmbientMode API toggles active state and status', async ({ page }) => {
        await setAmbientMode(page, true);
        await waitForAmbientActive(page, true);

        let status = await getAmbientModeStatus(page);

        expect(status?.enabled).toBe(true);
        expect(status?.active).toBe(true);

        await setAmbientMode(page, false);
        await waitForAmbientActive(page, false);

        status = await getAmbientModeStatus(page);
        expect(status?.enabled).toBe(false);
        expect(status?.active).toBe(false);
    });

    test('creates ambient DOM structure when enabled', async ({ page }) => {
        await setAmbientMode(page, true);
        await waitForAmbientActive(page, true);

        const container = getAmbientContainer(page);

        await expect(container).toBeAttached();
        await expect(container.locator('.fluid_ambient_fit')).toHaveCount(1);
        await expect(container.locator('.fluid_ambient_glow')).toHaveCount(1);
        await expect(container.locator('.fluid_ambient_canvas')).toHaveCount(2);
    });

    test('clips glow inside player by default', async ({ page }) => {
        await setAmbientMode(page, true);
        await waitForAmbientActive(page, true);

        const wrapper = getWrapper(page);

        await expect(wrapper).toHaveClass(/fp_ambient_clip/);
        await expect(wrapper).not.toHaveClass(/fp_ambient_bleed/);

        const overflow = await wrapper.evaluate((element) => window.getComputedStyle(element).overflow);

        expect(overflow).toBe('hidden');
    });

    test('samples video colors into visible canvas after playback', async ({ page }) => {
        await useReliableE2eVideoSource(page);
        await dismissInitialPlayOverlay(page);
        await ensureMainVideoMetadata(page);
        await setAmbientMode(page, true);
        await waitForAmbientActive(page, true);

        await page.evaluate(() => {
            const video = document.getElementById('fluid-player-e2e-case') as HTMLVideoElement | null;
            void video?.play().catch(() => undefined);
        });

        await waitForAmbientSampling(page, 30_000);
        await waitForAmbientCanvasPaint(page, 20_000);

        const status = await getAmbientModeStatus(page);

        expect(status?.corsBlocked).toBe(false);
        expect(status?.canSample).toBe(true);
        expect(status?.samplingReady).toBe(true);
    });

    test('aligns glow fit box near the displayed video rect', async ({ page }) => {
        await useReliableE2eVideoSource(page);
        await dismissInitialPlayOverlay(page);
        await ensureMainVideoMetadata(page);
        await setAmbientMode(page, true);
        await page.waitForTimeout(600);

        const layout = await page.evaluate(() => {
            const videoEl = document.querySelector('video');
            const fit = document.querySelector('.fluid_ambient_fit') as HTMLElement | null;

            if (!videoEl || !fit) {
                return null;
            }

            const videoRect = videoEl.getBoundingClientRect();
            const fitRect = fit.getBoundingClientRect();
            const bleedPadding = parseFloat(
                getComputedStyle(document.getElementById('fluid_video_wrapper_fluid-player-e2e-case')!)
                    .getPropertyValue('--fp-ambient-bleed-padding') || '10',
            );

            return {
                widthDelta: Math.abs(fitRect.width - videoRect.width),
                heightDelta: Math.abs(fitRect.height - videoRect.height),
                bleedPadding,
            };
        });

        expect(layout).not.toBeNull();
        expect(layout!.widthDelta).toBeLessThanOrEqual(layout!.bleedPadding * 2 + 4);
        expect(layout!.heightDelta).toBeLessThanOrEqual(layout!.bleedPadding * 2 + 4);
    });

    test('uses subtle glow visual tokens (low brightness and opacity)', async ({ page }) => {
        await setAmbientMode(page, true);
        await waitForAmbientActive(page, true);

        const styles = await getAmbientGlowStyles(page);

        expect(parseFloat(styles.brightness)).toBeLessThanOrEqual(1.15);
        expect(parseFloat(styles.saturate)).toBeLessThanOrEqual(1.3);
        expect(parseFloat(styles.containerOpacity)).toBeLessThanOrEqual(0.65);
        expect(parseFloat(styles.scaleX)).toBeLessThanOrEqual(1.12);
        expect(parseFloat(styles.scaleY)).toBeLessThanOrEqual(1.14);
    });

    test('persists ambient preference via settings menu store', async ({ page }) => {
        await setAmbientMode(page, true);
        await waitForAmbientActive(page, true);

        await reloadPlayerTestPage(page);
        await dismissInitialPlayOverlay(page);
        await waitForAmbientActive(page, true);

        const status = await getAmbientModeStatus(page);

        expect(status?.enabled).toBe(true);
    });
});
