export default function annotationsModule(playerInstance) {
    const POSITION_CLASSES = {
        topLeft: 'fluid_annotation_top_left',
        topRight: 'fluid_annotation_top_right',
        bottomLeft: 'fluid_annotation_bottom_left',
        bottomRight: 'fluid_annotation_bottom_right',
        center: 'fluid_annotation_center',
    };

    let itemElements = [];

    const getConfig = () => playerInstance.displayOptions.layoutControls.annotations || {};

    const getItems = () => {
        const items = getConfig().items;

        return Array.isArray(items) ? items.filter((item) => item && item.imageUrl) : [];
    };

    const isAnnotationsEnabled = () => {
        if (playerInstance.displayOptions.layoutControls.settingsMenu?.enabled !== false) {
            const store = playerInstance.getSettingsMenuStore?.();

            if (store && store.annotations === false) {
                return false;
            }
        }

        return getConfig().enabled !== false;
    };

    const shouldRenderOverlays = () => (
        isAnnotationsEnabled()
        && getItems().length > 0
        && !playerInstance.isCurrentlyPlayingAd
        && !!playerInstance.domRef.player
    );

    const isItemVisibleAtTime = (item, currentTime) => {
        const start = Number(item.start) || 0;
        const end = Number(item.end);

        if (!Number.isFinite(end)) {
            return currentTime >= start;
        }

        return currentTime >= start && currentTime < end;
    };

    const buildItemElement = (item, index) => {
        const positionKey = item.position && POSITION_CLASSES[item.position]
            ? item.position
            : 'bottomRight';
        const wrapper = document.createElement(item.linkUrl ? 'a' : 'div');

        wrapper.className = `fluid_annotation_item ${POSITION_CLASSES[positionKey]}`;
        wrapper.dataset.annotationIndex = String(index);

        if (item.linkUrl) {
            wrapper.href = item.linkUrl;
            wrapper.target = item.linkTarget || '_blank';
            wrapper.rel = 'noopener noreferrer';
            wrapper.addEventListener('click', (event) => {
                event.stopPropagation();

                if (typeof playerInstance.onAnnotationClick === 'function') {
                    playerInstance.onAnnotationClick(item, index, event);
                }
            });
        }

        const img = document.createElement('img');
        img.src = item.imageUrl;
        img.alt = item.alt || '';
        img.draggable = false;

        if (item.width) {
            img.style.width = `${item.width}px`;
        }

        if (item.height) {
            img.style.height = `${item.height}px`;
        }

        wrapper.appendChild(img);

        return wrapper;
    };

    const ensureAnnotationItems = () => {
        if (itemElements.length || !playerInstance.domRef.wrapper || !getItems().length) {
            return;
        }

        getItems().forEach((item, index) => {
            const element = buildItemElement(item, index);
            playerInstance.domRef.wrapper.appendChild(element);
            itemElements.push({ item, element });
        });
    };

    const syncAnnotationsLayerState = () => {
        const wrapper = playerInstance.domRef.wrapper;

        if (!wrapper) {
            return;
        }

        wrapper.classList.toggle('fp_annotations_off', !isAnnotationsEnabled());
    };

    const updateAnnotations = () => {
        ensureAnnotationItems();
        syncAnnotationsLayerState();

        if (!itemElements.length) {
            return;
        }

        if (!shouldRenderOverlays()) {
            itemElements.forEach(({ element }) => {
                element.classList.remove('fp_annotation_active');
            });
            return;
        }

        const currentTime = playerInstance.domRef.player.currentTime;

        itemElements.forEach(({ item, element }) => {
            const visible = isItemVisibleAtTime(item, currentTime);
            const isActive = element.classList.contains('fp_annotation_active');

            if (visible === isActive) {
                return;
            }

            if (visible) {
                element.classList.remove('fp_annotation_active');
                requestAnimationFrame(() => {
                    element.classList.add('fp_annotation_active');
                });
            } else {
                element.classList.remove('fp_annotation_active');
            }
        });
    };

    playerInstance.setAnnotationsEnabled = (enabled) => {
        if (typeof playerInstance.updateSettingsMenuStore === 'function') {
            playerInstance.updateSettingsMenuStore({ annotations: !!enabled });
        }

        updateAnnotations();
    };

    playerInstance.initAnnotations = () => {
        if (!getItems().length) {
            return;
        }

        ensureAnnotationItems();
        syncAnnotationsLayerState();
        updateAnnotations();

        if (typeof playerInstance.syncControlBarVisibilityState === 'function') {
            playerInstance.syncControlBarVisibilityState(playerInstance.isControlBarVisible());
        }

        const video = playerInstance.domRef.player;

        if (video) {
            video.addEventListener('timeupdate', updateAnnotations);
            video.addEventListener('seeked', updateAnnotations);
            video.addEventListener('play', updateAnnotations);
            video.addEventListener('pause', updateAnnotations);
        }

        playerInstance.destructors.push(() => {
            if (video) {
                video.removeEventListener('timeupdate', updateAnnotations);
                video.removeEventListener('seeked', updateAnnotations);
                video.removeEventListener('play', updateAnnotations);
                video.removeEventListener('pause', updateAnnotations);
            }

            itemElements.forEach(({ element }) => {
                element.remove();
            });
            itemElements = [];
        });
    };

    const previousSettingsChange = playerInstance.onSettingsMenuChange;

    playerInstance.onSettingsMenuChange = (id, value) => {
        if (id === 'annotations') {
            updateAnnotations();
        }

        if (typeof previousSettingsChange === 'function') {
            previousSettingsChange(id, value);
        }
    };
};
