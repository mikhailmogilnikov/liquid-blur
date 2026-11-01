// @vitest-environment node
import { render } from "svelte/server";
import { expect, it } from "vite-plus/test";
import Photo from "./svelte/Photo.svelte";

it("renders on the server, its menu hidden, nothing lifted", () => {
  const { body } = render(Photo);
  expect(body).toContain('role="menu"');
  expect(body).toContain("hidden");
  expect(body).toContain('role="menuitem"');
});
