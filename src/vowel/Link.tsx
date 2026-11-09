import type { AnchorHTMLAttributes, ReactNode } from "react";
import { SITE_BASE_PATH } from "./paths";
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string };
  children?: ReactNode;
  prefetch?: boolean;
};
export default function Link({ href, children, prefetch, ...props }: Props) {
  const raw = typeof href === "string" ? href : href.pathname || "/";
  const target =
    raw.startsWith("/") && !raw.startsWith(SITE_BASE_PATH + "/")
      ? `${SITE_BASE_PATH}${raw}`
      : raw;
  void prefetch;
  return (
    <a {...props} href={target}>
      {children}
    </a>
  );
}
