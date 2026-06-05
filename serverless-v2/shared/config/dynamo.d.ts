/**
 * Hand-written type declaration for the CommonJS `shared/config/dynamo.js`
 * module (TECH_STACK.md §3 interop note). The JS file ships no types; this
 * declaration is the documented contract so TS consumers in streaks-api can
 * `import { docClient } from '../../shared/config/dynamo'` with no `any`.
 */
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export declare const docClient: DynamoDBDocumentClient;
export declare const ddbClient: DynamoDBClient;
