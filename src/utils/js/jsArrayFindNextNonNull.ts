export const jsArrayFindNextNonNull = <T>(arr: (T | null)[], i: number): T =>
   (arr.find((item, index) => item != null && index > i) ?? arr.find((item) => item != null)) as T;
