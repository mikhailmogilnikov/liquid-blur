/**
 * Installs the press behaviors on import, for pages without a build step: from a CDN such as
 * jsDelivr (`@fluidkit/core/auto/+esm`).
 */
import { installPress } from "./blur/interaction";

installPress();
