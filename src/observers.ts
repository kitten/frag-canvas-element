let intersectionObserver: IntersectionObserver | undefined;
const intersectionListeners = new Map<Element, (isVisible: boolean) => void>();
const getIntersectionObserver = () =>
  intersectionObserver ||
  (intersectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const listener = intersectionListeners.get(entry.target);
      if (listener) {
        listener(entry.isIntersecting);
      }
    }
  }));

export function trackVisibility(
  element: Element,
  onChange: (isVisible: boolean) => void
): () => void {
  const observer = getIntersectionObserver();
  intersectionListeners.set(element, onChange);
  observer.observe(element);
  return () => {
    observer.unobserve(element);
    intersectionListeners.delete(element);
  };
}

let resizeObserver: ResizeObserver | undefined;
const resizeListeners = new Map<
  Element,
  (box: { inlineSize: number; blockSize: number }) => void
>();
const getResizeObserver = () =>
  resizeObserver ||
  (resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const listener = resizeListeners.get(entry.target);
      if (listener) listener(entry.devicePixelContentBoxSize[0]);
    }
  }));

export function trackResizes(
  element: Element,
  onChange: (box: { inlineSize: number; blockSize: number }) => void
): () => void {
  const observer = getResizeObserver();
  resizeListeners.set(element, onChange);
  observer.observe(element, { box: 'device-pixel-content-box' });
  return () => {
    resizeListeners.delete(element);
  };
}

export function trackTextUpdates(
  element: Element,
  onChange: () => void
): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(element, { subtree: true, characterData: true });
  return () => {
    observer.disconnect();
  };
}
