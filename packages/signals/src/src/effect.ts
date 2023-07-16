/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { Watch } from './watch';
import { global } from '../util/global';

/**
 * An effect can, optionally, register a cleanup function. If registered, the cleanup is executed
 * before the next effect run. The cleanup function makes it possible to "cancel" any work that the
 * previous effect run might have started.
 *
 * @developerPreview
 */
export type EffectCleanupFn = () => void;

/**
 * A callback passed to the effect function that makes it possible to register cleanup logic.
 */
export type EffectCleanupRegisterFn = (cleanupFn: EffectCleanupFn) => void;

/**
 * Tracks all effects registered within a given application and runs them via `flush`.
 */
export class EffectManager {
  private all = new Set<Watch>();
  private queue = new Map<Watch, null>();

  create(
    effectFn: (onCleanup: (cleanupFn: EffectCleanupFn) => void) => void,
    allowSignalWrites: boolean
  ): EffectRef {
    const watch = new Watch(
      effectFn,
      (watch) => {
        if (!this.all.has(watch)) {
          return;
        }

        this.queue.set(watch, null);
      },
      allowSignalWrites
    );

    this.all.add(watch);

    // Effects start dirty.
    watch.notify();

    let unregisterOnDestroy: (() => void) | undefined;

    const destroy = () => {
      watch.cleanup();
      unregisterOnDestroy?.();
      this.all.delete(watch);
      this.queue.delete(watch);
    };

    // unregisterOnDestroy = destroyRef?.onDestroy(destroy);

    return {
      destroy,
    };
  }

  flush(): void {
    if (this.queue.size === 0) {
      return;
    }

    for (const [watch, zone] of this.queue) {
      this.queue.delete(watch);
      watch.run();
    }
  }

  get isQueueEmpty(): boolean {
    return this.queue.size === 0;
  }
}

/**
 * A global reactive effect, which can be manually destroyed.
 *
 * @developerPreview
 */
export interface EffectRef {
  /**
   * Shut down the effect, removing it from any upcoming scheduled executions.
   */
  destroy(): void;
}

/**
 * Options passed to the `effect` function.
 *
 * @developerPreview
 */
export interface CreateEffectOptions {
  // /**
  //  * The `Injector` in which to create the effect.
  //  *
  //  * If this is not provided, the current [injection context](guide/dependency-injection-context)
  //  * will be used instead (via `inject`).
  //  */
  // injector?: Injector;

  /**
   * Whether the `effect` should require manual cleanup.
   *
   * If this is `false` (the default) the effect will automatically register itself to be cleaned up
   * with the current `DestroyRef`.
   */
  manualCleanup?: boolean;

  /**
   * Whether the `effect` should allow writing to signals.
   *
   * Using effects to synchronize data by writing to signals can lead to confusing and potentially
   * incorrect behavior, and should be enabled only when necessary.
   */
  allowSignalWrites?: boolean;
}

/**
 * Create a global `Effect` for the given reactive function.
 *
 * @developerPreview
 */
export function effect(
  effectFn: (onCleanup: EffectCleanupRegisterFn) => void,
  options?: CreateEffectOptions
): EffectRef {
  const effectManager = getEffectManager();
  return effectManager.create(effectFn, !!options?.allowSignalWrites);
}

function getEffectManager(): EffectManager {
  if (!global.__R_NG_FEATURES_GLOBAL_SIGNALS__) {
    global.__R_NG_FEATURES_GLOBAL_SIGNALS__ = new EffectManager();
  }
  return global.__R_NG_FEATURES_GLOBAL_SIGNALS__;
}
