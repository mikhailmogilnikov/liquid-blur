// @vitest-environment node
import { render } from "svelte/server";
import { expect, it } from "vite-plus/test";
import More from "./svelte/More.svelte";

it("renders on the server, the states as they're written", () => {
  const { body } = render(More);
  expect(body).toContain('data-testid="button"');
  expect(body).toContain('data-testid="panel"');
  expect(body).not.toContain("data-fk-away");
});
