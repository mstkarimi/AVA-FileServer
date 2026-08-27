import { useRef, useState, useEffect, useCallback } from 'react';

interface History { stack: string[]; idx: number }

/**
 * A Back/Forward model for folder navigation, like a browser's — but scoped to
 * the file manager so the buttons reflect visited FOLDERS, not tab switches or
 * modal opens.
 *
 * It observes `currentPath` (which the pages drive through the URL) and infers
 * what happened: landing on the previous/next entry in the stack is a
 * back/forward step (just move the pointer); anything else is a new
 * destination (truncate any forward entries and push). Because it only reads
 * currentPath, the browser's own Back/Forward buttons stay in sync too.
 */
export function useFolderHistory(currentPath: string, go: (path: string) => void) {
  const ref = useRef<History>({ stack: [currentPath], idx: 0 });
  const [, force] = useState(0);

  useEffect(() => {
    const h = ref.current;
    if (h.stack[h.idx] === currentPath) return;
    if (h.idx > 0 && h.stack[h.idx - 1] === currentPath) {
      h.idx -= 1;
    } else if (h.idx < h.stack.length - 1 && h.stack[h.idx + 1] === currentPath) {
      h.idx += 1;
    } else {
      h.stack = h.stack.slice(0, h.idx + 1);
      h.stack.push(currentPath);
      h.idx = h.stack.length - 1;
    }
    force(x => x + 1);
  }, [currentPath]);

  const onBack = useCallback(() => {
    const h = ref.current;
    if (h.idx > 0) go(h.stack[h.idx - 1]);
  }, [go]);

  const onForward = useCallback(() => {
    const h = ref.current;
    if (h.idx < h.stack.length - 1) go(h.stack[h.idx + 1]);
  }, [go]);

  const h = ref.current;
  return { onBack, onForward, canBack: h.idx > 0, canForward: h.idx < h.stack.length - 1 };
}
