import { refuse, type JsonObject, type JsonValue, type WebMcpTool } from './spec';

type Schema = JsonObject;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function schemaList(value: JsonValue | undefined): Schema[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function pathFor(parent: string, key: string | number): string {
  return typeof key === 'number'
    ? `${parent}[${key}]`
    : parent === '$'
      ? `$.${key}`
      : `${parent}.${key}`;
}

function validate(schema: Schema, value: unknown, path: string): string[] {
  const errors: string[] = [];
  const type = schema.type;

  if (typeof type === 'string') {
    const valid =
      (type === 'object' && isObject(value)) ||
      (type === 'array' && Array.isArray(value)) ||
      (type === 'string' && typeof value === 'string') ||
      (type === 'boolean' && typeof value === 'boolean') ||
      (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (type === 'integer' && typeof value === 'number' && Number.isSafeInteger(value)) ||
      (type === 'null' && value === null);
    if (!valid) return [`${path} must be ${type}.`];
  }

  if (Array.isArray(schema.enum) && !schema.enum.some(entry => Object.is(entry, value))) {
    errors.push(`${path} must be one of ${schema.enum.map(String).join(', ')}.`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path} must contain at least ${schema.minLength} character(s).`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${path} must contain at most ${schema.maxLength} character(s).`);
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}.`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path} must be at most ${schema.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s).`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push(`${path} must contain at most ${schema.maxItems} item(s).`);
    }
    if (isObject(schema.items)) {
      value.forEach((entry, index) =>
        errors.push(...validate(schema.items as Schema, entry, pathFor(path, index)))
      );
    }
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
    for (const key of required) {
      if (!(key in value)) errors.push(`${pathFor(path, key)} is required.`);
    }
    for (const [key, entry] of Object.entries(value)) {
      const propertySchema = properties[key];
      if (isObject(propertySchema))
        errors.push(...validate(propertySchema, entry, pathFor(path, key)));
      else if (schema.additionalProperties === false)
        errors.push(`${pathFor(path, key)} is not allowed.`);
    }
  }

  const oneOf = schemaList(schema.oneOf);
  if (oneOf.length > 0) {
    const matches = oneOf.filter(option => validate(option, value, path).length === 0).length;
    if (matches !== 1) errors.push(`${path} must match exactly 1 allowed input shape.`);
  }
  const anyOf = schemaList(schema.anyOf);
  if (anyOf.length > 0 && !anyOf.some(option => validate(option, value, path).length === 0)) {
    errors.push(`${path} must match at least 1 allowed input shape.`);
  }

  return errors;
}

export function validateToolInput(schema: JsonObject | undefined, input: unknown): string[] {
  if (!schema) return [];
  return validate(schema, input, '$');
}

/** Validate before presence/authorization so malformed calls can never create a pending write. */
export function withInputValidation(tool: WebMcpTool): WebMcpTool {
  const execute = tool.execute;
  return {
    ...tool,
    execute: async (input, context) => {
      const errors = validateToolInput(tool.inputSchema, input);
      if (errors.length > 0) {
        return refuse(
          'BAD_INPUT',
          errors[0],
          'Call get_context, then use the tool schema exactly as registered.'
        );
      }
      return execute(input, context);
    },
  };
}
