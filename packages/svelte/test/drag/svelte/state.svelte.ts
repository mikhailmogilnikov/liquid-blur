/** Props a test can change after mounting: a `$state` proxy, as a parent's state would be */
export function reactive<T extends object>(value: T): T {
  const state = $state(value);
  return state;
}
