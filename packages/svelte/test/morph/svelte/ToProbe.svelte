<script lang="ts">
  import { useMorph } from "../../../src/morph/index.js";

  const morph = useMorph();
  export const to = morph.to;
</script>

<div>
  <div {@attach morph.state("a")}>A</div>
  <div {@attach morph.state("b")}>B</div>
</div>
