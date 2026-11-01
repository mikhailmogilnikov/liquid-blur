// @vitest-environment node
import { render } from "svelte/server";
import { expect, it } from "vite-plus/test";
import Tabs from "./svelte/Tabs.svelte";

it("renders on the server", () => {
  const { body } = render(Tabs, { props: { defaultValue: "overview" } });
  expect(body).toContain("Overview");
  expect(body).toContain("data-selected");
});
