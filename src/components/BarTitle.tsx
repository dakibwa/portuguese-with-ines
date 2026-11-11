/**
 * An account bar's name: one, or the booking page's two (`Book a Lesson` for
 * a visitor, `Your Lessons` once the page is a student's), of which the
 * page's `data-booking-account` shows one.
 */
export function BarTitle({ bar }: { bar: { title: string; bookTitle?: string } }) {
  return bar.bookTitle
    ? <><span className="site-header__title-book">{bar.bookTitle}</span><span className="site-header__title-account">{bar.title}</span></>
    : <>{bar.title}</>;
}
