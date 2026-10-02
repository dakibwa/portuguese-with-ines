let locks = 0;
let originalOverflow = "";

/** Each overlay releases its own lock; the last release restores the page. */
export function lockPageScroll() {
  if (locks === 0) originalOverflow = document.body.style.overflow;
  locks += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) document.body.style.overflow = originalOverflow;
  };
}
