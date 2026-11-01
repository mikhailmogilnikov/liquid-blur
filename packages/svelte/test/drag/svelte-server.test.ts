// @vitest-environment node
import { render } from "svelte/server";
import { expect, it } from "vite-plus/test";
import Sheet from "./svelte/Sheet.svelte";

it("renders on the server, at offset 0", () => {
  const { body } = render(Sheet, { props: { defaultSnap: 1 } });
  expect(body).toContain('data-snap="1"');
  expect(body).not.toContain("translate");
});
