export const WIDE = '(width >= 1080px)';

export const isWide = () => matchMedia(WIDE).matches;

export const onWidthChange = fn => matchMedia(WIDE).addEventListener('change', fn);

export const SPLIT = '(width >= 1680px)';

export const isSplit = () => matchMedia(SPLIT).matches;

export const onSplitChange = fn => matchMedia(SPLIT).addEventListener('change', fn);
