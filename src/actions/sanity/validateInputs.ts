export const isDefined = (...args: any[]): boolean => {
  return args.every((arg) => arg !== undefined && arg !== null); // return true if all args are defined
};
