// @vitest-environment node
import { render } from "svelte/server";
import { expect, it } from "vite-plus/test";
import { list } from "./svelte/state.svelte";
import Todos from "./svelte/Todos.svelte";

it("renders on the server without anything of its own", () => {
  list.todos = ["a", "b"];
  const { body } = render(Todos);
  expect(body).toContain("<ul");
  expect(body).toContain('id="a"');
  expect(body).not.toContain("transform");
  expect(body).not.toContain("data-moving");
});
