/**
 * Remember the last result of a computation. The function gives it back while
 * every key is the same value as in the call before.
 */
export function createMemo<Value>(): (
  keys: readonly unknown[],
  compute: () => Value,
) => Value {
  let last: { keys: readonly unknown[]; value: Value } | undefined;
  return (keys, compute) => {
    if (
      last &&
      last.keys.length === keys.length &&
      last.keys.every((key, index) => Object.is(key, keys[index]))
    ) {
      return last.value;
    }
    const value = compute();
    last = { keys, value };
    return value;
  };
}
