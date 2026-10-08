/// <reference types="react/canary" />
import { ViewTransition } from "react";
import { PageTurn } from "@/components/PageTurn";
import { SplatArrivals } from "@/components/SplatArrivals";

/*
 * Next remounts this template on every navigation, so the page being left
 * exits and the page arriving enters, turning into one another (globals.css).
 * Navigations are React transitions, so nothing here holds a click back; in a
 * browser without view transitions the pages simply swap with a dissolve.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition default="none" enter="page-in" exit="page-out">
      <div className="route-fade">
        <PageTurn />
        <SplatArrivals />
        {children}
      </div>
    </ViewTransition>
  );
}
