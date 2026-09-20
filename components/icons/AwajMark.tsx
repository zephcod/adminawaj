import * as React from "react";

/**
 * The Awaj ET gradient mark, loaded as a direct static-file `<img>` rather
 * than inlined SVG/JSX.
 *
 * Why not inline JSX: NavShell renders the brand mark in the mobile drawer
 * header AND the desktop sidebar at once (only one is hidden via CSS
 * `display:none` per breakpoint, the other still exists in the DOM). Two
 * copies of the same gradient `id`s
 * (`awajmark-a` etc.) would then be live in the document simultaneously.
 * Browsers resolve `url(#id)` / `xlink:href` references to the *first*
 * matching id in the whole document, so if that first copy sits inside the
 * `display:none` instance for the current breakpoint, the gradient fails to
 * paint for the visible instance too.
 *
 * Loading the artwork as an `<img src="/awaj-mark.svg">` instead sidesteps
 * this entirely: each `<img>` parses the SVG in its own isolated document,
 * so gradient ids can never collide across instances, however many times
 * this component is rendered on the page.
 */
export function AwajMark({
  alt = "",
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/awaj-mark.svg" alt={alt} {...props} />;
}
