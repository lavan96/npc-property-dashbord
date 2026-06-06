/**
 * Back-compat shim. The original compass-only route now delegates to
 * `routeReportThroughTemplate`, which works for every report_type/variant
 * via the shared resolver.
 *
 * Existing call sites (e.g. `PremiumPdfButton`) keep working unchanged.
 */
export {
  routeReportThroughTemplate as tryRouteThroughTemplateBuilder,
  type TemplateBuilderRouteResult,
} from './routeReportThroughTemplate';
