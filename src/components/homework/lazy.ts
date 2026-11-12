import { deferred } from "@/lib/deferred";

/*
 * Her homework comes with its own code and stylesheet, fetched only when a
 * lesson's homework opens. Nothing opens it while features.homework is false.
 */
export const { Component: TeacherHomework } = deferred(() => import("./TeacherHomework").then((m) => m.TeacherHomework), { waiting: "Loading…" });
