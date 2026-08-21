/**
  * Hand-written host Typert manifest for the localHistory Remote. Registered
  * through `ctx.typert.register` when the registry exists. Strict codecs are
  * shared with the client; the gateway must not consult `@Remote` marker tables.
  */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types';
/** The localHistory namespace's host manifest (strict codecs shared with the client). */
export declare const TYPERT_MANIFEST: TypertContribution;
