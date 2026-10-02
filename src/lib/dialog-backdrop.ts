import { useRef, type MouseEvent, type PointerEvent } from "react";

function isBackdrop(event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.target === event.currentTarget && (
    event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom
  );
}

/** A selection or drag starting inside a dialog must not dismiss its draft. */
export function useDialogBackdrop(onDismiss: () => void) {
  const startedOutside = useRef(false);
  return {
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      startedOutside.current = isBackdrop(event);
    },
    onPointerCancel() { startedOutside.current = false; },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const dismiss = startedOutside.current && isBackdrop(event);
      startedOutside.current = false;
      if (dismiss) onDismiss();
    }
  };
}
