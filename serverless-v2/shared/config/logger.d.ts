/**
 * Hand-written type declaration for the CommonJS `shared/config/logger.js`
 * module (TECH_STACK.md §3 interop note, mirrors `dynamo.d.ts`). The JS file
 * ships no types; this declaration is the documented contract so TS consumers
 * in streaks-api can `import { logger } from '../../shared/config/logger'`
 * with no `any`.
 */
import type { Logger } from 'winston';

export declare const logger: Logger;
