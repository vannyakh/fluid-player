import fs from 'fs';
import path from 'path';
import { Locator, Page } from 'playwright';

export const E2E_VIDEO_SELECTOR = '#fluid-player-e2e-case';

/** Local sample served from webpack `test/static/` (see CopyPlugin in webpack.config.js). */
export const E2E_FALLBACK_VIDEO_SRC = '/static/e2e-sample.mp4';

const E2E_SAMPLE_VIDEO_PATH = path.resolve(__dirname, '../../test/static/e2e-sample.mp4');

/** Serve a small local MP4 instead of remote Fluid CDN assets (call before navigation). */
export async function routeReliableE2eVideoSources(page: Page): Promise<void> {
    const sampleBody = fs.readFileSync(E2E_SAMPLE_VIDEO_PATH);

    await page.route(/cdn\.fluidplayer\.com\/videos\//i, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'video/mp4',
            body: sampleBody,
        });
    });
}

/**
 * Replace multi-source CDN URLs with a single reliable sample (ambient / playback e2e).
 */
export async function useReliableE2eVideoSource(page: Page, src = E2E_FALLBACK_VIDEO_SRC): Promise<void> {
    const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8080';
    const absoluteSrc = src.startsWith('http')
        ? src
        : `${baseURL.replace(/\/$/, '')}${src}`;

    await page.evaluate((videoSrc) => {
        const internals = (window as Window & {
            fpFeaturesE2e?: { getInternals: () => { setVideoSource?: (url: string) => void } };
            fluidPlayerDebug?: { internals: { setVideoSource?: (url: string) => void } }[];
        }).fpFeaturesE2e?.getInternals?.()
            ?? (window as Window & {
                fluidPlayerDebug?: { internals: { setVideoSource?: (url: string) => void } }[];
            }).fluidPlayerDebug?.slice(-1)[0]?.internals;

        if (internals?.setVideoSource) {
            internals.setVideoSource(videoSrc);
            return;
        }

        const video = document.getElementById('fluid-player-e2e-case') as HTMLVideoElement | null;

        if (!video) {
            return;
        }

        video.crossOrigin = 'anonymous';
        video.src = videoSrc;
        video.load();
        void video.play().catch(() => undefined);
    }, absoluteSrc);
}

/**
 * Start playback without awaiting the play() promise inside evaluate
 * (an unsettled play() promise can hang the whole test).
 */
export async function ensureMainVideoMetadata(page: Page, timeout = 30_000): Promise<void> {
    await page.evaluate(() => {
        const video = document.getElementById('fluid-player-e2e-case') as HTMLVideoElement | null;

        if (!video) {
            return;
        }

        void video.play().catch(() => undefined);
    });

    await page.waitForFunction(() => {
        const video = document.getElementById('fluid-player-e2e-case') as HTMLVideoElement | null;

        return !!(video && video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0);
    }, undefined, { timeout });
}

/**
 * Seek to a given time in the video
 *
 * @param video - Playwright video locator
 * @param time - The time you want to seek to
 */
export async function setVideoCurrentTime(video: Locator, time: number): Promise<void> {
    await video.page().waitForFunction(
        (vid) => {
            const videoElement = vid as HTMLVideoElement | null;
            return videoElement && videoElement.readyState >= 2;
        },
        await video.elementHandle(),
        { timeout: 10000 }
    );

    // Seek to the specified time
    await video.evaluate((vid, t) => {
        const videoElement = vid as HTMLVideoElement;
        videoElement.currentTime = t;
    }, time);
}

/**
 * Wait until the video duration has changed
 * This way you can detect if the ad or content is loaded in
 *
 * @param page - The Playwright page instance
 * @param initialDuration - The initial duration of the video element
 * @param timeout
 */
export async function waitForVideoDurationChange(
    page: Page,
    initialDuration: number,
    timeout: number = 10000
): Promise<void> {
    await page.waitForFunction(
        (initialDur) => {
            const videoElement = document.querySelector('video') as HTMLVideoElement;
            return videoElement.duration !== initialDur;
        },
        initialDuration,
        { timeout }
    );
}

/**
 * Get the current duration of the video
 *
 * @param video - Playwright video locator
 * @returns video duration time
 */
export async function getVideoDuration(video: Locator): Promise<number> {
    return await video.evaluate((vid) => {
        const videoElement = vid as HTMLVideoElement;
        return videoElement.duration;
    });
}

/**
 * Get the current time of the video
 *
 * @param video - Playwright video locator
 * @returns video current time
 */
export async function getVideoCurrentTime(video: Locator): Promise<number> {
    return await video.evaluate((vid) => {
        const videoElement = vid as HTMLVideoElement;
        return videoElement.currentTime;
    });
}

/**
 * Waits until the given video element starts playing.
 *
 * @param video - The Playwright Locator for the video element.
 */
export async function waitForVideoToPlay(video: Locator, timeout = 20_000): Promise<void> {
    await video.page().waitForFunction(() => {
        const element = document.getElementById('fluid-player-e2e-case') as HTMLVideoElement | null;

        return !!(
            element
            && !element.paused
            && element.readyState >= 2
            && element.currentTime > 0
        );
    }, undefined, { timeout });
}