let gsapLoader = null;

export const MOTION = {
    duration: {
        fast: 0.28,
        normal: 0.35,
        slow: 0.45,
    },
    ease: {
        out: 'power3.out',
        in: 'power2.in',
        inOut: 'power2.inOut',
    },
};

export const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

export const loadPlayerGsap = () => {
    if (!gsapLoader) {
        gsapLoader = import(
            /* webpackChunkName: "gsap" */
            '../../vendor/gsap'
        ).then((mod) => {
            const api = mod.gsap || mod.default;

            if (!api) {
                throw new Error('[PlayerMotion] GSAP failed to load from vendor');
            }

            return api;
        });
    }

    return gsapLoader;
};

export const killMotionTweens = (...targets) => {
    if (prefersReducedMotion()) {
        return;
    }

    loadPlayerGsap()
        .then((gsap) => {
            targets.filter(Boolean).forEach((target) => gsap.killTweensOf(target));
        })
        .catch(() => {});
};

const getMiniPlayerEnterOffset = (position) => {
    const corner = String(position || 'bottom right').toLowerCase();

    if (corner.includes('top')) {
        return { y: -24 };
    }

    if (corner.includes('left')) {
        return { x: -24 };
    }

    if (corner.includes('right')) {
        return { x: 24 };
    }

    return { y: 24 };
};

export const animateMiniPlayerEnter = async (wrapper, position, enabled = true) => {
    if (!enabled || !wrapper || prefersReducedMotion()) {
        return null;
    }

    try {
        const gsap = await loadPlayerGsap();
        const offset = getMiniPlayerEnterOffset(position);

        gsap.killTweensOf(wrapper);

        gsap.set(wrapper, {
            opacity: 0,
            scale: 0.92,
            x: offset.x || 0,
            y: offset.y || 0,
            transformOrigin: 'center center',
        });

        return gsap.to(wrapper, {
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
            duration: MOTION.duration.slow,
            ease: MOTION.ease.out,
            overwrite: true,
            clearProps: 'transform',
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
        const gsap = await loadPlayerGsap();

        gsap.killTweensOf(wrapper);

        return new Promise((resolve) => {
            gsap.to(wrapper, {
                opacity: 0,
                scale: 0.9,
                duration: MOTION.duration.fast,
                ease: MOTION.ease.in,
                overwrite: true,
                onComplete: resolve,
            });
        });
    } catch (error) {
        return null;
    }
};

export const animateMiniPlayerSnap = async (wrapper, left, top, enabled = true) => {
    if (!wrapper) {
        return null;
    }

    if (!enabled || prefersReducedMotion()) {
        wrapper.style.left = `${left}px`;
        wrapper.style.top = `${top}px`;
        return null;
    }

    try {
        const gsap = await loadPlayerGsap();

        gsap.killTweensOf(wrapper);

        return gsap.to(wrapper, {
            left,
            top,
            duration: MOTION.duration.normal,
            ease: MOTION.ease.out,
            overwrite: true,
        });
    } catch (error) {
        wrapper.style.left = `${left}px`;
        wrapper.style.top = `${top}px`;
        return null;
    }
};

export const animateMiniPlayerPlaceholder = async (placeholder, enabled = true) => {
    if (!enabled || !placeholder || prefersReducedMotion()) {
        return null;
    }

    try {
        const gsap = await loadPlayerGsap();

        gsap.killTweensOf(placeholder);
        gsap.set(placeholder, { opacity: 0, scale: 0.97 });

        return gsap.to(placeholder, {
            opacity: 1,
            scale: 1,
            duration: MOTION.duration.normal,
            ease: MOTION.ease.out,
        });
    } catch (error) {
        return null;
    }
};

export const animateTheatreEnter = async (targets, enabled = true) => {
    const { parent, wrapper, page, sidebar } = targets || {};

    if (!enabled || prefersReducedMotion()) {
        return null;
    }

    const motionTargets = [parent, wrapper, page, sidebar].filter(Boolean);

    if (!motionTargets.length) {
        return null;
    }

    try {
        const gsap = await loadPlayerGsap();

        gsap.killTweensOf(motionTargets);

        const timeline = gsap.timeline({ defaults: { ease: MOTION.ease.out } });

        if (page) {
            gsap.set(page, { opacity: 0, y: 12 });
            timeline.to(page, {
                opacity: 1,
                y: 0,
                duration: MOTION.duration.normal,
            }, 0);
        }

        if (sidebar) {
            gsap.set(sidebar, { opacity: 1, x: 0 });
            timeline.to(sidebar, {
                opacity: 0,
                x: 20,
                duration: MOTION.duration.fast,
                ease: MOTION.ease.in,
            }, 0);
        }

        if (parent) {
            gsap.set(parent, { opacity: 0.88, scale: 0.98, transformOrigin: 'center top' });
            timeline.to(parent, {
                opacity: 1,
                scale: 1,
                duration: MOTION.duration.slow,
            }, 0.04);
        }

        if (wrapper) {
            gsap.set(wrapper, { opacity: 0.92 });
            timeline.to(wrapper, {
                opacity: 1,
                duration: MOTION.duration.normal,
            }, 0.06);
        }

        return timeline;
    } catch (error) {
        return null;
    }
};

export const animateTheatreExit = async (targets, enabled = true) => {
    const { parent, wrapper, page, sidebar } = targets || {};

    if (!enabled || prefersReducedMotion()) {
        return null;
    }

    const motionTargets = [parent, wrapper, page, sidebar].filter(Boolean);

    if (!motionTargets.length) {
        return null;
    }

    try {
        const gsap = await loadPlayerGsap();

        gsap.killTweensOf(motionTargets);

        return new Promise((resolve) => {
            const timeline = gsap.timeline({
                defaults: { ease: MOTION.ease.in },
                onComplete: resolve,
            });

            if (wrapper) {
                timeline.to(wrapper, {
                    opacity: 0.9,
                    duration: MOTION.duration.fast,
                }, 0);
            }

            if (parent) {
                timeline.to(parent, {
                    opacity: 0.9,
                    scale: 0.99,
                    duration: MOTION.duration.normal,
                }, 0);
            }

            if (page) {
                timeline.to(page, {
                    opacity: 0,
                    y: 8,
                    duration: MOTION.duration.fast,
                }, 0);
            }

            if (sidebar) {
                timeline.fromTo(sidebar, {
                    opacity: 0,
                    x: 16,
                }, {
                    opacity: 1,
                    x: 0,
                    duration: MOTION.duration.normal,
                    ease: MOTION.ease.out,
                }, 0.08);
            }
        });
    } catch (error) {
        return null;
    }
};
