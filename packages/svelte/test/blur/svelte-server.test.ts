// @vitest-environment node
import { render } from "svelte/server";
import { expect, it } from "vite-plus/test";
import Server from "./svelte/Server.svelte";

it("renders on the server", () => {
  const { body } = render(Server);
  expect(body).toMatch(/class="lb lb-group[^"]*"/);
  expect(body).toMatch(/class="lb lb-interactive[^"]*"/);
});
