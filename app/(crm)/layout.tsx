/**
 * CRM Layout
 *
 * CRM is a layer over existing domains (accounting, finance, ecommerce).
 * Party is the central object around which all CRM features are built.
 */

import { ReactNode } from "react";

export default function CRMLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
