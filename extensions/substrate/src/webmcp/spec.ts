/**
 * The WebMCP surface, feature-detected.
 *
 * The current draft exposes an object-shaped API at `document.modelContext`.
 * Chromium's origin-trial builds have also shipped two transitional shapes:
 * object schemas plus string execution arguments at `document.modelContext`,
 * and string schemas plus string execution arguments at
 * `navigator.modelContext`. Keep those native differences in this module so
 * the rest of Substrate only deals with the current object contract.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
};

/**
 * The current draft always supplies an options dictionary containing a signal.
 * The argument itself remains optional here because older hosts and direct
 * compatibility callers may invoke a producer callback with only its input.
 */
export type ToolExecuteCallbackOptions = {
  signal: AbortSignal;
};

type CompatibleToolExecuteCallbackOptions = Partial<ToolExecuteCallbackOptions>;

/** A producer definition supplied to registerTool(). */
export type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonObject;
  annotations?: ToolAnnotations;
  execute: (
    input: JsonObject,
    options?: CompatibleToolExecuteCallbackOptions
  ) => Promise<JsonValue>;
};

/** Consumer metadata returned by getTools(); it never exposes execute(). */
export type RegisteredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonObject;
  window: Window;
  origin: string;
  annotations?: ToolAnnotations;
};

export type ModelContextRegisterToolOptions = {
  exposedTo?: string[];
  signal?: AbortSignal;
};

export type ModelContextGetToolOptions = {
  fromOrigins?: string[];
};

export type ModelContextExecuteToolOptions = {
  signal?: AbortSignal;
};

export type ModelContext = EventTarget & {
  registerTool: (tool: WebMcpTool, options?: ModelContextRegisterToolOptions) => Promise<void>;
  getTools?: (options?: ModelContextGetToolOptions) => RegisteredTool[] | Promise<RegisteredTool[]>;
  executeTool?: (
    tool: RegisteredTool,
    input?: JsonObject,
    options?: ModelContextExecuteToolOptions
  ) => Promise<string | null>;
  ontoolchange?: ((this: ModelContext, event: Event) => unknown) | null;
};

type SchemaEncoding = 'object' | 'string' | 'unknown';
type ExecuteInputEncoding = 'object' | 'string' | 'unavailable';

export type ModelContextCapabilities = {
  registeredSchema: SchemaEncoding;
  executeInput: ExecuteInputEncoding;
};

type NativeRegisteredTool = Omit<RegisteredTool, 'inputSchema'> & {
  inputSchema?: JsonObject | string;
};

type NativeTool = Omit<WebMcpTool, 'inputSchema' | 'execute'> & {
  inputSchema?: JsonObject | string;
  execute: (input: JsonObject | string, options?: { signal?: AbortSignal }) => Promise<JsonValue>;
};

type NativeModelContext = EventTarget & {
  registerTool: (
    tool: NativeTool,
    options?: ModelContextRegisterToolOptions
  ) => void | Promise<void>;
  getTools?: (
    options?: ModelContextGetToolOptions
  ) => NativeRegisteredTool[] | Promise<NativeRegisteredTool[]>;
  executeTool?: (
    tool: NativeRegisteredTool,
    input?: JsonObject | string,
    options?: ModelContextExecuteToolOptions
  ) => Promise<string | null>;
  ontoolchange?: ((event: Event) => unknown) | null;
};

type ModelContextHost = {
  modelContext?: NativeModelContext | ModelContext;
};

/**
 * Detect the observable native contract without treating its property location
 * as an API-version signal. The draft's optional object input gives
 * executeTool a Web IDL arity of 1; Chromium's required DOMString input gives
 * it an arity of 2. A discovered schema supplies the independent schema
 * capability.
 */
export function detectModelContextCapabilities(
  context: { executeTool?: { readonly length: number } },
  tools: ReadonlyArray<{ inputSchema?: unknown }> = []
): ModelContextCapabilities {
  const schemaKinds = new Set<Exclude<SchemaEncoding, 'unknown'>>();
  for (let index = 0; index < tools.length; index += 1) {
    const tool = tools[index];
    if (typeof tool.inputSchema === 'string') schemaKinds.add('string');
    else if (tool.inputSchema && typeof tool.inputSchema === 'object') schemaKinds.add('object');
  }

  return {
    registeredSchema: schemaKinds.size === 1 ? [...schemaKinds][0] : 'unknown',
    executeInput: context.executeTool
      ? context.executeTool.length >= 2
        ? 'string'
        : 'object'
      : 'unavailable',
  };
}

const nativeAdapters = new WeakMap<object, ModelContext>();
const adapters = new WeakSet<object>();

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return '';
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

function isSchemaShapeFailure(error: unknown): boolean {
  const name = errorName(error);
  return (
    name === 'TypeError' ||
    (name === 'InvalidStateError' && /(?:json|schema)/i.test(errorMessage(error)))
  );
}

function parseInput(input: JsonObject | string | undefined): JsonObject {
  const parsed = typeof input === 'string' ? JSON.parse(input) : (input ?? {});
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new TypeError('WebMCP tool input must be a JSON object.');
  }
  return parsed as JsonObject;
}

function producerForNative(
  tool: WebMcpTool,
  schema: Exclude<SchemaEncoding, 'unknown'>
): NativeTool {
  return {
    ...tool,
    inputSchema:
      schema === 'string' && tool.inputSchema ? JSON.stringify(tool.inputSchema) : tool.inputSchema,
    execute: (input, options) =>
      tool.execute(parseInput(input), options?.signal ? { signal: options.signal } : undefined),
  };
}

function normalizeRegisteredTool(
  nativeTool: NativeRegisteredTool,
  nativeDescriptors: WeakMap<object, NativeRegisteredTool>
): RegisteredTool {
  if (typeof nativeTool.inputSchema !== 'string') {
    nativeDescriptors.set(nativeTool, nativeTool);
    return nativeTool as RegisteredTool;
  }

  const normalized: RegisteredTool = {
    ...nativeTool,
    inputSchema: nativeTool.inputSchema
      ? (JSON.parse(nativeTool.inputSchema) as JsonObject)
      : undefined,
  };
  nativeDescriptors.set(normalized, nativeTool);
  return normalized;
}

function exposeAdapterOnDocument(nativeContext: NativeModelContext, adapter: ModelContext): void {
  if (typeof document === 'undefined') return;
  const current = (document as unknown as ModelContextHost).modelContext;
  if (current && current !== nativeContext && current !== adapter) return;
  try {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      enumerable: true,
      value: adapter,
    });
  } catch (_error) {
    // getModelContext() still returns the cached adapter when the host's
    // Document property cannot be shadowed.
  }
}

function adaptContext(nativeContext: NativeModelContext, exposeOnDocument: boolean): ModelContext {
  const cached = nativeAdapters.get(nativeContext);
  if (cached) {
    if (exposeOnDocument) exposeAdapterOnDocument(nativeContext, cached);
    return cached;
  }

  const nativeDescriptors = new WeakMap<object, NativeRegisteredTool>();
  let capabilities = detectModelContextCapabilities(nativeContext);
  const target = new EventTarget();
  let ontoolchange: EventListener | null = null;

  const adapter = target as ModelContext;
  adapters.add(adapter);
  nativeAdapters.set(nativeContext, adapter);

  const readNativeTools = async (
    options?: ModelContextGetToolOptions
  ): Promise<NativeRegisteredTool[]> => {
    if (!nativeContext.getTools) return [];
    return Promise.resolve(nativeContext.getTools(options));
  };

  Object.assign(adapter, {
    async registerTool(tool: WebMcpTool, options?: ModelContextRegisterToolOptions): Promise<void> {
      if (capabilities.registeredSchema === 'unknown') {
        try {
          const existing = await readNativeTools();
          capabilities = detectModelContextCapabilities(nativeContext, existing);
        } catch (_error) {
          // Registration itself remains the authoritative capability probe.
        }
      }

      let encoding: Exclude<SchemaEncoding, 'unknown'> =
        capabilities.registeredSchema === 'string' ? 'string' : 'object';
      try {
        await nativeContext.registerTool(producerForNative(tool, encoding), options);
      } catch (error) {
        if (encoding !== 'object' || !isSchemaShapeFailure(error)) throw error;
        encoding = 'string';
        await nativeContext.registerTool(producerForNative(tool, encoding), options);
        capabilities = { ...capabilities, registeredSchema: 'string' };
        return;
      }

      try {
        const discovered = await readNativeTools();
        const detected = detectModelContextCapabilities(nativeContext, discovered);
        capabilities = {
          ...capabilities,
          registeredSchema:
            detected.registeredSchema === 'unknown' ? encoding : detected.registeredSchema,
        };
      } catch (_error) {
        capabilities = { ...capabilities, registeredSchema: encoding };
      }
    },

    async getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]> {
      const nativeTools = await readNativeTools(options);
      const detected = detectModelContextCapabilities(nativeContext, nativeTools);
      if (detected.registeredSchema !== 'unknown') {
        capabilities = { ...capabilities, registeredSchema: detected.registeredSchema };
      }
      return nativeTools.map(tool => normalizeRegisteredTool(tool, nativeDescriptors));
    },

    async executeTool(
      tool: RegisteredTool,
      input: JsonObject = {},
      options?: ModelContextExecuteToolOptions
    ): Promise<string | null> {
      if (!nativeContext.executeTool) {
        throw new DOMException(
          'This WebMCP host cannot execute discovered tools.',
          'NotSupportedError'
        );
      }
      const nativeTool = nativeDescriptors.get(tool) ?? (tool as NativeRegisteredTool);
      const nativeInput = capabilities.executeInput === 'string' ? JSON.stringify(input) : input;
      return nativeContext.executeTool(nativeTool, nativeInput, options);
    },
  });

  Object.defineProperty(adapter, 'ontoolchange', {
    configurable: true,
    enumerable: true,
    get: () => ontoolchange,
    set: (value: ((event: Event) => unknown) | null | undefined) => {
      if (ontoolchange) adapter.removeEventListener('toolchange', ontoolchange);
      ontoolchange = typeof value === 'function' ? (value as EventListener) : null;
      if (ontoolchange) adapter.addEventListener('toolchange', ontoolchange);
    },
  });

  nativeContext.addEventListener('toolchange', () => {
    adapter.dispatchEvent(new Event('toolchange'));
  });

  if (exposeOnDocument) exposeAdapterOnDocument(nativeContext, adapter);
  return adapter;
}

/** Why the tools are not available, in words a person can act on. */
export type RegistrationFailure =
  | { kind: 'unsupported' }
  | { kind: 'aborted'; message: string }
  | { kind: 'insecure'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'unknown'; message: string };

export type RegistrationResult =
  | { ok: true; registered: string[] }
  | { ok: false; registered: string[]; failure: RegistrationFailure };

/**
 * Return a standards-shaped context. Contract detection is based on method and
 * descriptor capabilities; the document/navigator choice only locates the
 * native object and decides whether a navigator-only host needs a document
 * compatibility property.
 */
export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null;
  const fromDocument = (document as unknown as ModelContextHost).modelContext;
  if (fromDocument && adapters.has(fromDocument)) return fromDocument as ModelContext;

  const fromNavigator =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as unknown as ModelContextHost).modelContext;
  const nativeContext = (fromDocument ?? fromNavigator) as NativeModelContext | undefined;
  if (!nativeContext) return null;

  const capabilities = detectModelContextCapabilities(nativeContext);
  const navigatorOnly = !fromDocument && Boolean(fromNavigator);
  if (!navigatorOnly && capabilities.executeInput !== 'string') {
    return nativeContext as unknown as ModelContext;
  }
  return adaptContext(nativeContext, navigatorOnly || capabilities.executeInput === 'string');
}

function describe(error: unknown): RegistrationFailure {
  const name = errorName(error);
  const message = errorMessage(error);
  if (name === 'AbortError') {
    return { kind: 'aborted', message: `Tool registration was cancelled. (${message})` };
  }
  if (name === 'SecurityError') {
    return {
      kind: 'insecure',
      message:
        'The browser rejected WebMCP security requirements. The document may not be ' +
        'origin-keyed, or an exposed origin may be invalid or untrustworthy. Use a secure, ' +
        `origin-keyed page and only valid HTTPS exposed origins. (${message})`,
    };
  }
  if (name === 'NotAllowedError') {
    return {
      kind: 'blocked',
      message:
        'The tools permissions policy is switched off for this page, so no agent can ' +
        `see its tools. (${message})`,
    };
  }
  if (name === 'InvalidStateError') {
    return {
      kind: 'invalid',
      message:
        'A tool registration was invalid. The document may be inactive, the name may be ' +
        `duplicate or invalid, or the name or description may be empty. (${message})`,
    };
  }
  if (name === 'TypeError' || error instanceof TypeError) {
    return {
      kind: 'invalid',
      message: `A tool definition or input schema could not be converted or serialized. (${message})`,
    };
  }
  return { kind: 'unknown', message };
}

function abortedFailure(reason: unknown): RegistrationFailure {
  return {
    kind: 'aborted',
    message: `Tool registration was cancelled. (${errorMessage(reason)})`,
  };
}

/** Register all route tools as one transaction owned by the lifecycle signal. */
export async function register(
  tools: WebMcpTool[],
  signal: AbortSignal
): Promise<RegistrationResult> {
  const context = getModelContext();
  if (!context) return { ok: false, registered: [], failure: { kind: 'unsupported' } };

  const batch = new AbortController();
  const abortBatch = () => batch.abort(signal.reason);
  if (signal.aborted) {
    abortBatch();
    return { ok: false, registered: [], failure: abortedFailure(signal.reason) };
  }
  signal.addEventListener('abort', abortBatch, { once: true });

  const registered: string[] = [];
  for (let index = 0; index < tools.length; index += 1) {
    const tool = tools[index];
    try {
      await context.registerTool(tool, { signal: batch.signal });
      registered.push(tool.name);
    } catch (error) {
      batch.abort(error);
      signal.removeEventListener('abort', abortBatch);
      return {
        ok: false,
        registered: [],
        failure: signal.aborted ? abortedFailure(signal.reason) : describe(error),
      };
    }
  }
  return { ok: true, registered };
}

/** Consumer metadata currently visible to an agent; no execute callback is fabricated. */
export function liveTools(): Promise<RegisteredTool[]> {
  const context = getModelContext();
  if (!context?.getTools) return Promise.resolve([]);
  try {
    return Promise.resolve(context.getTools()).catch(() => []);
  } catch (_error) {
    return Promise.resolve([]);
  }
}

/** An expected refusal. Returned, never thrown, so the agent can recover. */
export function refuse(code: string, message: string, hint: string): JsonObject {
  return { ok: false, code, message, hint };
}
