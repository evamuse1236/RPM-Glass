export const WIDE = '(width >= 1080px)';

export const isWide = () => matchMedia(WIDE).matches;

export const onWidthChange = fn => matchMedia(WIDE).addEventListener('change', fn);
