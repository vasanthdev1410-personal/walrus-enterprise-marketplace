export const compactProperties = <T extends object>(value: {
  [Key in keyof T]?: T[Key] | undefined;
}): T => Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined)) as T;
