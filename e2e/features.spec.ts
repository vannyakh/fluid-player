import { test, expect } from '@playwright/test';
import {
    getWrapper,
    dismissInitialPlayOverlay,
    hoverPlayerToShowControls,
    isControlBarVisible,
    isSettingsMenuOpen,
    openSettingsMenu,
    getTheatreIconLayers,
    waitForTheatreIconState,
    ensureTheatreModeOff,
    decodeSvgFromBackgroundImage,
    THEATRE_ICON_MARKERS,
    DOWNLOAD_ICON_MARKER,
} from './functions/player';
import { setVideoCurrentTime, waitForVideoToPlay } from './functions/video';
import { gotoPlayerTestPage, resetPlayerTestPage } from './functions/navigation';

test.describe('new player features', () => {
    test.describe.configure({ timeout: 60_000 });

    test.beforeEach(async ({ page }) => {
        await gotoPlayerTestPage(page, process.env.FP_FEATURES_E2E_PAGE);
        await resetPlayerTestPage(page);
        await dismissInitialPlayOverlay(page);
    });

    test.describe('settings menu', () => {

        test('keeps control bar visible while menu is open', async ({ page }) => {
            await openSettingsMenu(page);

            await expect(page.locator('.fluid_settings_menu.fp_show')).toBeVisible();
            expect(await isControlBarVisible(page)).toBeTruthy();
            await expect(page.locator('.fluid_controls_container.fade_out')).toHaveCount(0);
        });

        test('auto-closes menu and hides control bar after 5s of inactivity', async ({ page }) => {
            await openSettingsMenu(page);

            await expect(page.locator('.fluid_settings_menu.fp_show')).toBeVisible();
            expect(await isControlBarVisible(page)).toBeTruthy();

            await page.waitForTimeout(5500);

            await expect(page.locator('.fluid_settings_menu.fp_show')).toHaveCount(0);
            expect(await isSettingsMenuOpen(page)).toBeFalsy();
            expect(await isControlBarVisible(page)).toBeFalsy();
        });

        test('resets idle timer when interacting with the menu', async ({ page }) => {
            await openSettingsMenu(page);

            await page.waitForTimeout(3000);
            await page.locator('.fluid_settings_menu').hover();
            await page.waitForTimeout(3000);

            await expect(page.locator('.fluid_settings_menu.fp_show')).toBeVisible();

            await page.waitForTimeout(3000);

            await expect(page.locator('.fluid_settings_menu.fp_show')).toHaveCount(0);
        });

        test('opens quality sub-panel from settings', async ({ page }) => {
            await openSettingsMenu(page);

            await page.locator('.fluid_settings_row[data-panel="quality"]').click();

            await expect(page.locator('.fluid_settings_menu.fluid_settings_mode_quality')).toBeVisible();
            await expect(page.locator('.fluid_settings_sub_title')).toHaveText('Quality');
        });
    });

    test.describe('theatre mode', () => {

        test.beforeEach(async ({ page }) => {
            await ensureTheatreModeOff(page);
        });

        test('toggles theatre layout and button active state', async ({ page }) => {
            const wrapper = getWrapper(page);
            const theatreButton = page.locator('.fluid_control_theatre');

            await hoverPlayerToShowControls(page);
            await theatreButton.click();

            await expect(wrapper).toHaveClass(/fluid_theatre_mode/);
            await expect(theatreButton).toHaveClass(/fluid_button_theatre_active/);
            await expect(theatreButton).toHaveAttribute('aria-pressed', 'true');
            await expect(page.locator('#watch-page')).toHaveClass(/fluid_theatre_page_active/);
            await expect(page.locator('#watch-sidebar')).toHaveClass(/fluid_theatre_sidebar_hidden/);

            await theatreButton.click();

            await expect(wrapper).not.toHaveClass(/fluid_theatre_mode/);
            await expect(theatreButton).not.toHaveClass(/fluid_button_theatre_active/);
            await expect(theatreButton).toHaveAttribute('aria-pressed', 'false');
        });

        test('uses theatre icon for default view and default-views icon when theatre is on', async ({ page }) => {
            const theatreButton = page.locator('.fluid_control_theatre');

            await hoverPlayerToShowControls(page);
            await waitForTheatreIconState(page, false);

            const off = await getTheatreIconLayers(theatreButton);

            expect(parseFloat(off.beforeOpacity)).toBeGreaterThan(0.9);
            expect(parseFloat(off.afterOpacity)).toBeLessThan(0.1);
            expect(decodeSvgFromBackgroundImage(off.beforeBackground)).toContain(THEATRE_ICON_MARKERS.theatre);
            expect(decodeSvgFromBackgroundImage(off.afterBackground)).toContain(THEATRE_ICON_MARKERS.defaultViews);

            await theatreButton.click();

            await expect(theatreButton).toHaveClass(/fluid_button_theatre_active/);
            await expect(theatreButton).toHaveAttribute('aria-pressed', 'true');
            await waitForTheatreIconState(page, true);

            const on = await getTheatreIconLayers(theatreButton);

            expect(parseFloat(on.beforeOpacity)).toBeLessThan(0.1);
            expect(parseFloat(on.afterOpacity)).toBeGreaterThan(0.9);
            expect(decodeSvgFromBackgroundImage(on.beforeBackground)).toContain(THEATRE_ICON_MARKERS.theatre);
            expect(decodeSvgFromBackgroundImage(on.afterBackground)).toContain(THEATRE_ICON_MARKERS.defaultViews);
        });
    });

    test.describe('mini player', () => {

        test('floats player to body and restores on exit', async ({ page }) => {
            const wrapper = getWrapper(page);
            const miniButton = page.locator('.fluid_control_mini_player');

            await hoverPlayerToShowControls(page);
            await miniButton.click();

            await expect(wrapper).toHaveClass(/fluid_mini_player_mode/);
            await page.waitForFunction(() => {
                const el = document.getElementById('fluid_video_wrapper_fluid-player-e2e-case');
                return el && el.parentElement === document.body;
            });

            await miniButton.click();

            await expect(wrapper).not.toHaveClass(/fluid_mini_player_mode/);
            await page.waitForFunction(() => {
                const el = document.getElementById('fluid_video_wrapper_fluid-player-e2e-case');
                return el && el.parentElement !== document.body;
            });
        });

        test('hides theatre and settings controls in mini player mode', async ({ page }) => {
            await hoverPlayerToShowControls(page);
            await page.locator('.fluid_control_mini_player').click();

            await expect(page.locator('.fluid_control_theatre')).toBeHidden();
            await expect(page.locator('.fluid_control_video_source')).toBeHidden();
            await expect(page.locator('.fluid_control_fullscreen')).toBeHidden();
        });
    });

    test.describe('annotations', () => {

        test('shows annotation overlay during configured time range', async ({ page }) => {
            const video = page.locator('video');
            const wrapper = getWrapper(page);

            await dismissInitialPlayOverlay(page);
            await waitForVideoToPlay(video);
            await setVideoCurrentTime(video, 20);

            await page.waitForTimeout(500);

            await expect(wrapper.locator('.fluid_annotation_item.fp_annotation_active')).toBeVisible();
        });

        test('hides annotations when disabled in settings', async ({ page }) => {
            const video = page.locator('video');
            const wrapper = getWrapper(page);

            await openSettingsMenu(page);
            await page.locator('.fluid_settings_row[data-setting-key="annotations"] .fluid_settings_toggle').click();
            await page.locator('.fluid_control_video_source').click();

            await dismissInitialPlayOverlay(page);
            await waitForVideoToPlay(video);
            await setVideoCurrentTime(video, 20);
            await page.waitForTimeout(500);

            await expect(wrapper.locator('.fluid_annotation_item.fp_annotation_active')).toHaveCount(0);
            await expect(wrapper).toHaveClass(/fp_annotations_off/);
        });
    });

    test.describe('download control', () => {

        test('uses custom download svg icon', async ({ page }) => {
            await hoverPlayerToShowControls(page);

            const downloadButton = page.locator('.fluid_control_download');
            const backgroundImage = await downloadButton.evaluate((element) => {
                return window.getComputedStyle(element, '::before').backgroundImage;
            });
            const svg = decodeSvgFromBackgroundImage(backgroundImage);

            expect(svg).toBeTruthy();
            expect(svg).toContain(DOWNLOAD_ICON_MARKER);
        });
    });
});
