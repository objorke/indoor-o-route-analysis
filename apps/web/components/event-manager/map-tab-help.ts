/**
 * Explanations for the Map tab options. Shared by the inline tooltips and the
 * Event info dialog so the two never drift apart.
 */
export const MAP_TAB_HELP = {
  saveEncoded:
    "Embeds the PDF (base64) in the JSON so the event file is self-contained. Untick to keep the JSON small and load the map from its source path/URL.",
  layout:
    "How the pages of a multi-page PDF are put together on one canvas. Horizontal: pages side by side. Vertical: pages stacked top-to-bottom. Pages: one page at a time with a page switcher; use it when every page shows the same floor plan so graph edges aren't drawn more than once.",
  pageTransform:
    "How map coordinates are computed per page. Automatic: one transform covers the whole composed canvas (all pages share one coordinate frame). Manual: each page has its own top-left/bottom-right transform; use it when pages are at different offsets or scales. The page selector in the transform editor picks the page you edit.",
  georef:
    "Latitude/longitude of the map's top-left corner. Used to show the cursor's lat/lon and for GPX export.",
} as const;
