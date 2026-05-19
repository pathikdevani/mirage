/**
 * Branded string IDs — same runtime representation as `string`, but nominally
 * distinct in the type system. Prevents accidentally passing a `WorkspaceId`
 * where a `SchemaId` was expected.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, 'OrgId'>;
export type UserId = Brand<string, 'UserId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type SchemaId = Brand<string, 'SchemaId'>;
export type SetId = Brand<string, 'SetId'>;
export type CustomFunctionId = Brand<string, 'CustomFunctionId'>;
export type ConnectorRecordId = Brand<string, 'ConnectorRecordId'>;
export type RunId = Brand<string, 'RunId'>;

/** Cast a plain string to a branded id. Use at trust boundaries only (DB load, JWT claim). */
export const asId = <T extends Brand<string, string>>(s: string): T => s as T;
