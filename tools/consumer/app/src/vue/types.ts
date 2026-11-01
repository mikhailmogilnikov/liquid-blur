// Types an app leans on, checked and never run: what must compile, and what mustn't
import { useIndicator, useMorph } from "@fluidkit/vue";

export function types() {
  // The states' type is the one given, not read from the first state
  const morph = useMorph<"a" | "b">({ defaultValue: "a" });
  void morph.to("b");
  // @ts-expect-error: not one of its states
  void morph.to("c");
  // With none given, any state
  void useMorph({ defaultValue: "a" }).to("b");

  const tabs = useIndicator<"x" | "y">({ defaultValue: "x" });
  tabs.select("y");
  // @ts-expect-error: not one of its items
  tabs.select("z");
}
