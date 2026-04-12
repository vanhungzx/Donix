export function getType(obj: unknown): string {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

export function tryPromise<T>(tryFunc: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      resolve(tryFunc());
    } catch (error) {
      reject(error);
    }
  });
}
