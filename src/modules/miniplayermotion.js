let gsapLoader = null;

export const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

export const loadMiniPlayerGsap = () => {
    if (!gsapLoader) {
        gsapLoader = import(
            /* webpackChunkName: "gsap" */
            '../../vendor/gsap'
        ).then((mod) => {
            const api = mod.gsap || mod.default;

            if (!api) {
                throw new Error('[MiniPlayer] GSAP failed to load from vendor');
            }

            return api;
        });
    }

    return gsapLoader;
};

const getEnterOffset = (position) => {
    const corner = String(position || 'bottom right').toLowerCase();

    if (corner.includes('top')) {
        return { y: -28 };
    }

    if (corner.includes('left')) {
        return { x: -28 };
    }

    if (corner.includes('right')) {
        return { x: 28 };
    }

    return { y: 28 };
};

export const animateMiniPlayerEnter = async (wrapper, position, enabled = true) => {
    if (!enabled || !wrapper || prefersReducedMotion()) {
        return null;
    }

    try {
        const gsap = await loadMiniPlayerGsap();
        const offset = getEnterOffset(position);

        gsap.killTweensOf(wrapper);

        gsap.set(wrapper, {
            opacity: 0,
            scale: 0.9,
            x: offset.x || 0,
            y: offset.y || 0,
            transformOrigin: 'center center',
        });

        return gsap.to(wrapper, {
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
            duration: 0.45,
            ease: 'power3.out',
            overwrite: true,
        });
    } catch (error) {
        return null;
    }
};

export const animateMiniPlayerExit = async (wrapper, enabled = true) => {
    if (!enabled || !wrapper || prefersReducedMotion()) {
        return null;
    }

    try {
        const gsap = await loadMiniPlayerGsap();

        gsap.killTweensOf(wrapper);

        return new Promise((resolve) => {
            gsap.to(wrapper, {
                opacity: 0,
                scale: 0.88,
                duration: 0.28,
                ease: 'power2.in',
                overwrite: true,
                onComplete: resolve,
            });
        });
    } catch (error) {
        return null;
    }
};

export const animateMiniPlayerSnap = async (wrapper, left, top, enabled = true) => {
    if (!enabled || !wrapper || prefersReducedMotion()) {
        if (wrapper) {
            wrapper.style.left = `${left}px`;
            wrapper.style.top = `${top}px`;
        }

        return null;
    }

    try {
        const gsap = await loadMiniPlayerGsap();

        gsap.killTweensOf(wrapper);

        return gsap.to(wrapper, {
            left,
            top,
            duration: 0.35,
            ease: 'power3.out',
            overwrite: true,
        });
    } catch (error) {
        if (wrapper) {
            wrapper.style.left = `${left}px`;
            wrapper.style.top = `${top}px`;
        }

        return null;
    }
};

export const animateMiniPlayerPlaceholder = async (placeholder, enabled = true) => {
    if (!enabled || !placeholder || prefersReducedMotion()) {
        return null;
    }

    try {
        const gsap = await loadMiniPlayerGsap();

        gsap.killTweensOf(placeholder);
        gsap.set(placeholder, { opacity: 0, scale: 0.96 });
        return gsap.to(placeholder, {
            opacity: 1,
            scale: 1,
            duration: 0.35,
            ease: 'power2.out',
        });
    } catch (error) {
        return null;
    }
};
