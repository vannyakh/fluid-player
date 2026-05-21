const GHOST_CLASS = 'fluid_mini_player_snap_ghost';
const GHOST_ACTIVE_CLASS = 'fluid_mini_player_snap_ghost--visible';

const CORNER_IDS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

const DEFAULT_SNAP_MARGIN = 12;

/**
 * @returns {{ id: string, left: number, top: number }[]}
 */
export const getSnapTargets = (width, height, margin = DEFAULT_SNAP_MARGIN) => {
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);

    return [
        { id: 'top-left', left: margin, top: margin },
        { id: 'top-right', left: maxLeft - margin, top: margin },
        { id: 'bottom-left', left: margin, top: maxTop - margin },
        { id: 'bottom-right', left: maxLeft - margin, top: maxTop - margin },
    ];
};

/**
 * @param {number} left
 * @param {number} top
 * @param {{ id: string, left: number, top: number }[]} targets
 */
export const findNearestSnapTarget = (left, top, targets) => {
    let nearest = targets[0];
    let minDistance = Infinity;

    targets.forEach((target) => {
        const dx = target.left - left;
        const dy = target.top - top;
        const distance = dx * dx + dy * dy;

        if (distance < minDistance) {
            minDistance = distance;
            nearest = target;
        }
    });

    return nearest;
};

export const createSnapGhost = (width, height) => {
    const ghost = document.createElement('div');
    ghost.className = GHOST_CLASS;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    document.body.appendChild(ghost);
    return ghost;
};

export const updateSnapGhost = (ghost, target) => {
    if (!ghost || !target) {
        return;
    }

    ghost.style.left = `${target.left}px`;
    ghost.style.top = `${target.top}px`;
    ghost.classList.add(GHOST_ACTIVE_CLASS);
    ghost.dataset.snapCorner = target.id;
};

export const hideSnapGhost = (ghost) => {
    if (!ghost) {
        return;
    }

    ghost.classList.remove(GHOST_ACTIVE_CLASS);
    delete ghost.dataset.snapCorner;
};

export const removeSnapGhost = (ghost) => {
    if (ghost?.parentElement) {
        ghost.parentElement.removeChild(ghost);
    }
};

export { CORNER_IDS, DEFAULT_SNAP_MARGIN, GHOST_CLASS };
