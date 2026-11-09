import { BOOT } from "./runtime";
export const SITE_BASE_PATH = BOOT.basePath || "";
export const publicAssetPath = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;
export const publicAssetUrl = (path: string) =>
  `url("${publicAssetPath(path)}")`;
