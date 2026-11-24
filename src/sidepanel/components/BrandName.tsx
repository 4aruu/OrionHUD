import { APP_NAME } from "../../shared/brand";

/** The product name inside running text; `.brand-name` keeps it from breaking across lines. */
export function BrandName() {
  return <span className="brand-name">{APP_NAME}</span>;
}
