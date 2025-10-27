import Ajv, { Schema, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RuleSet } from './types';

const ajv = new Ajv({
  strict: true,
  validateSchema: true,
  allErrors: true,
  allowUnionTypes: true
});

addFormats(ajv);

const KNOWN_OPERATORS = [
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'IN',
  'NOT_IN',
  'MATCHES',
  'EXISTS'
] as const;

ajv.addKeyword({
  keyword: 'knownOp',
  schemaType: 'boolean',
  validate(_schema, data) {
    return typeof data === 'string' && KNOWN_OPERATORS.includes(data as any);
  }
});

ajv.addKeyword({
  keyword: 'jsonPath',
  schemaType: 'boolean',
  validate(_schema, data) {
    if (typeof data !== 'string') return false;
    return data.startsWith('$.');
  }
});

const ruleSetSchema: Schema = {
  $id: 'workflowRuleSet',
  type: 'object',
  required: ['name', 'version', 'flows'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    version: { type: 'string', minLength: 1 },
    schemas: {
      type: 'object',
      additionalProperties: true
    },
    tables: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['name', 'hitPolicy', 'rules'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          hitPolicy: { enum: ['FIRST', 'PRIORITY', 'MERGE'] },
          rules: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['when', 'result'],
              additionalProperties: false,
              properties: {
                when: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['path', 'op'],
                    additionalProperties: false,
                    properties: {
                      path: { type: 'string', minLength: 2, jsonPath: true },
                      op: { type: 'string', knownOp: true },
                      value: {}
                    }
                  }
                },
                result: { type: 'object' },
                priority: { type: 'integer' }
              }
            }
          }
        }
      }
    },
    flows: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['name', 'entry', 'nodes', 'edges'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          entry: { type: 'string', minLength: 1 },
          nodes: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'type'],
              properties: {
                id: { type: 'string', minLength: 1 },
                type: {
                  enum: ['TABLE', 'EXPR', 'MERGE', 'HUMAN_FORM', 'WAIT_EVENT', 'BARRIER']
                }
              }
            }
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              required: ['from', 'to'],
              additionalProperties: false,
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                on: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

const ruleSetValidator: ValidateFunction<RuleSet> = ajv.compile<RuleSet>(ruleSetSchema);

let schemasPreloaded = false;

function preloadSchemas() {
  if (schemasPreloaded) return;
  const schemaPath = resolve(import.meta.dir, './dsl/ajv-schemas.json');
  let raw: string;
  try {
    raw = readFileSync(schemaPath, 'utf8');
  } catch (err) {
    throw new Error(`[validation] failed to read schema bundle at ${schemaPath}: ${(err as Error).message}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[validation] ajv-schemas.json is not valid JSON: ${(err as Error).message}`);
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload)) {
      payload.forEach((schema) => ajv.addSchema(schema));
    } else if (Array.isArray((payload as any).schemas)) {
      (payload as any).schemas.forEach((schema: Schema) => ajv.addSchema(schema));
    } else {
      Object.values(payload as Record<string, Schema>).forEach((schema) => {
        ajv.addSchema(schema);
      });
    }
  } else {
    throw new Error('[validation] schema bundle must be an object or array');
  }
  schemasPreloaded = true;
}

export function getAjv(): Ajv {
  preloadSchemas();
  return ajv;
}

export function validateRuleSet(json: unknown): asserts json is RuleSet {
  preloadSchemas();
  if (!ruleSetValidator(json)) {
    const message = ajv.errorsText(ruleSetValidator.errors, { separator: '\n' });
    throw new Error(`RuleSet validation failed: ${message}`);
  }
}

const MAX_PAYLOAD_BYTES = 256 * 1024;

export function validateBySchemaRef(ref: string, data: unknown): void {
  preloadSchemas();
  const validator = ajv.getSchema(ref);
  if (!validator) {
    throw new Error(`Schema with ref '${ref}' is not registered`);
  }

  const size = byteLengthSafe(data);
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(`Payload exceeds maximum allowed size (${MAX_PAYLOAD_BYTES} bytes)`);
  }

  if (!validator(data)) {
    const message = ajv.errorsText(validator.errors, { separator: '\n' });
    throw new Error(`Payload validation failed: ${message}`);
  }
}

function byteLengthSafe(data: unknown): number {
  if (data == null) return 0;
  try {
    const text = JSON.stringify(data);
    return Buffer.byteLength(text, 'utf8');
  } catch {
    return MAX_PAYLOAD_BYTES + 1;
  }
}
