/**
 * Lazy singleton helper so heavy ML models load once per process.
 */

export type ModelLoader<T> = () => Promise<T>;

/**
 * Create a process-wide lazy singleton around an async model loader.
 * Concurrent callers share one in-flight load promise.
 */
export function createModelSingleton<T>(loader: ModelLoader<T>): {
  getInstance: () => Promise<T>;
  reset: () => void;
  isLoaded: () => boolean;
} {
  let instance: T | null = null;
  let loading: Promise<T> | null = null;

  async function getInstance(): Promise<T> {
    if (instance) return instance;
    if (!loading) {
      loading = loader()
        .then((loaded) => {
          instance = loaded;
          return loaded;
        })
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  }

  return {
    getInstance,
    reset() {
      instance = null;
      loading = null;
    },
    isLoaded() {
      return instance !== null;
    },
  };
}
