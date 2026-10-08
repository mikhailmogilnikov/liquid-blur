/**
 * Installs the press behaviors on import, for pages without a build step:
 * from a CDN that resolves its import of `@liquid-web/core`, such as jsDelivr's `/+esm`.
 */
import { installPress } from "./interaction";

installPress();
