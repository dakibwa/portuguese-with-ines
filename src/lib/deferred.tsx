import { type ComponentType, useEffect, useState } from "react";

type DeferredOptions = {
  /** Said while the code is on its way; nothing is shown when it is empty. */
  waiting?: string;
  /** Shows the arrived code: the booking page eases it in with its own transition. */
  reveal?: (show: () => void) => void;
  /**
   * An add-on that may draw nothing. If its code cannot load, the page carries
   * on without it rather than asking to try again.
   */
  quiet?: boolean;
};

/**
 * A component whose code is fetched when it is needed. Once the code is here
 * it renders in the same commit as whatever shows it, so a transition eases to
 * its real height. (next/dynamic suspended on every first render, even with
 * the code already fetched, and React then held its fallback for 300ms before
 * the form popped in.) `load` fetches it ahead of time.
 */
export function deferred<Props extends object>(
  fetchComponent: () => Promise<ComponentType<Props>>,
  { waiting = "", reveal = (show) => show(), quiet = false }: DeferredOptions = {}
) {
  let ready: ComponentType<Props> | null = null;
  let loading: Promise<ComponentType<Props>> | null = null;
  const load = () =>
    (loading ??= fetchComponent().then(
      (component) => (ready = component),
      (error: unknown) => {
        loading = null;
        throw error;
      }
    ));
  function Deferred(props: Props) {
    const [Loaded, setLoaded] = useState(() => ready);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (Loaded || failed) return;
      let live = true;
      load().then(
        (component) => {
          if (live) reveal(() => setLoaded(() => component));
        },
        () => {
          if (live) setFailed(true);
        }
      );
      return () => {
        live = false;
      };
    }, [Loaded, failed]);
    if (Loaded) return <Loaded {...props} />;
    if (failed) {
      if (quiet) return null;
      return (
        <p className="booking-state-note" role="alert">
          This part of the page couldn&rsquo;t load.{" "}
          <button className="button button--outline button--small" onClick={() => setFailed(false)} type="button">
            Try again
          </button>
        </p>
      );
    }
    return waiting ? <p className="booking-state-note">{waiting}</p> : null;
  }
  return { Component: Deferred, load };
}
