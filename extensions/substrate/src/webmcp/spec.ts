/**
 * The WebMCP surface, feature-detected.
 *
 * Everything the browser gives us is behind `document.modelContext`, which does
 * not exist in most browsers and did not exist in any of them a year ago. This
 * module is the only place that touches it, so the rest of Substrate can be
 * written as if tools were ordinary functions.
 *
 * Two details here are load-bearing and easy to get wrong:
 *
 * 1. `execute` receives `(input, context)` and the CONTEXT ARGUMENT IS
 *    OPTIONAL. An agent may call it with one argument. Destructuring the second
 *    would throw a TypeError, which the agent sees as an opaque failure with
 *    nothing to act on, so every signature here takes it optionally.
 *
 * 2. Registration fails for its own reasons, separately from execution.
 *    A duplicate or malformed name throws InvalidStateError, an untrustworthy
 *    origin throws SecurityError, a disabled `tools` permissions policy throws
 *    NotAllowedError, and a bad inputSchema throws TypeError. A judge with a
 *    misconfigured browser needs to be told which one happened rather than
 *    shown an empty panel, so `register` reports the reason instead of
 *    swallowing it.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** The two annotation hints the spec actually defines. There are no others. */
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

export type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema?: JsonObject;
  annotations?: ToolAnnotations;
  execute: (input: JsonObject, context?: { signal?: AbortSignal }) => Promise<JsonValue>;
};

export type ModelContext = EventTarget & {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
  getTools?: () => WebMcpTool[] | Promise<WebMcpTool[]>;
  executeTool?: (
    tool: WebMcpTool,
    input?: JsonObject,
    options?: { signal?: AbortSignal }
  ) => Promise<string>;
};

type ModelContextHost = {
  modelContext?: ModelContext;
};

type LegacyWebMcpTool = Omit<WebMcpTool, 'inputSchema' | 'execute'> & {
  inputSchema?: string;
  execute: (input: JsonObject | string, context?: { signal?: AbortSignal }) => Promise<JsonValue>;
};

type LegacyModelContext = EventTarget & {
  registerTool: (tool: LegacyWebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
  getTools?: () => LegacyWebMcpTool[] | Promise<LegacyWebMcpTool[]>;
  executeTool?: (
    tool: LegacyWebMcpTool,
    input?: string,
    options?: { signal?: AbortSignal }
  ) => Promise<string>;
};

const legacyAdapters = new WeakMap<object, ModelContext>();

function parseObject(value: JsonObject | string | undefined): JsonObject {
  if (typeof value !== 'string') return value ?? {};
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new TypeError('WebMCP tool input must be a JSON object.');
  }
  return parsed as JsonObject;
}

/**
 * Chrome's origin-trial implementation uses `navigator.modelContext`, a
 * string schema, and stringified execution arguments. Keep that native surface
 * available to browser agents while exposing the current object contract at
 * `document.modelContext` for standards-shaped callers.
 */
function adaptLegacyContext(nativeContext: LegacyModelContext): ModelContext {
  const cached = legacyAdapters.get(nativeContext);
  if (cached) return cached;

  const normalized = new Map<string, WebMcpTool>();
  const nativeTools = new Map<string, LegacyWebMcpTool>();
  const adapter = Object.assign(new EventTarget(), {
    async registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void> {
      const legacyTool: LegacyWebMcpTool = {
        ...tool,
        inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : undefined,
        execute: (input, context) => tool.execute(parseObject(input), context),
      };
      await nativeContext.registerTool(legacyTool, options);
      normalized.set(tool.name, tool);
      nativeTools.set(tool.name, legacyTool);
      options?.signal?.addEventListener(
        'abort',
        () => {
          normalized.delete(tool.name);
          nativeTools.delete(tool.name);
        },
        { once: true }
      );
    },
    async getTools(): Promise<WebMcpTool[]> {
      if (!nativeContext.getTools) return [...normalized.values()];
      const discovered = await nativeContext.getTools();
      return discovered.map(nativeTool => {
        const known = normalized.get(nativeTool.name);
        if (known) return known;
        return {
          ...nativeTool,
          inputSchema: nativeTool.inputSchema
            ? (JSON.parse(nativeTool.inputSchema) as JsonObject)
            : undefined,
          execute: (input, context) => nativeTool.execute(input, context),
        };
      });
    },
    async executeTool(
      tool: WebMcpTool,
      input: JsonObject = {},
      options?: { signal?: AbortSignal }
    ): Promise<string> {
      const nativeTool = nativeTools.get(tool.name);
      if (nativeContext.executeTool && nativeTool) {
        return nativeContext.executeTool(nativeTool, JSON.stringify(input), options);
      }
      return JSON.stringify(await tool.execute(input, { signal: options?.signal }));
    },
  }) as ModelContext;

  legacyAdapters.set(nativeContext, adapter);
  try {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: adapter,
    });
  } catch {
    // Registration still works through the adapter even if the host locks the
    // document property. The native navigator surface remains untouched.
  }
  return adapter;
}

/** Why the tools are not available, in words a person can act on. */
export type RegistrationFailure =
  | { kind: 'unsupported' }
  | { kind: 'insecure'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'unknown'; message: string };

export type RegistrationResult =
  | { ok: true; registered: string[] }
  | { ok: false; registered: string[]; failure: RegistrationFailure };

/**
 * The context, if this browser has one. `navigator.modelContext` is the older
 * preview location and is still worth checking, because a judge may be on a
 * build that predates the move to `document`.
 */
export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null;
  const fromDocument = (document as unknown as ModelContextHost).modelContext;
  if (fromDocument) return fromDocument;
  const fromNavigator =
    typeof navigator === 'undefined'
      ? undefined
      : ((navigator as unknown as ModelContextHost).modelContext as unknown as
          | LegacyModelContext
          | undefined);
  return fromNavigator ? adaptLegacyContext(fromNavigator) : null;
}

export function isSupported(): boolean {
  return getModelContext() !== null;
}

function describe(error: unknown): RegistrationFailure {
  // SAFETY: DOMException carries the name the spec defines; anything else is
  // reported as unknown rather than guessed at.
  const name = error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'SecurityError') {
    return {
      kind: 'insecure',
      message:
        'The browser refused to expose tools on this page because the origin is not ' +
        `trustworthy. Serve it over HTTPS or from localhost. (${message})`,
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
  if (name === 'InvalidStateError' || name === 'TypeError' || error instanceof TypeError) {
    return {
      kind: 'invalid',
      message: `A tool was rejected as malformed, so registration stopped. (${message})`,
    };
  }
  return { kind: 'unknown', message };
}

/**
 * Register a route's tools against one AbortSignal.
 *
 * Registration stops at the first rejection rather than pressing on, because a
 * half-registered surface is worse than none: the agent would see some tools,
 * conclude it can do the job, and fail partway through a study.
 */
export async function register(
  tools: WebMcpTool[],
  signal: AbortSignal
): Promise<RegistrationResult> {
  const context = getModelContext();
  if (!context) return { ok: false, registered: [], failure: { kind: 'unsupported' } };

  const registered: string[] = [];
  for (const tool of tools) {
    try {
      await context.registerTool(tool, { signal });
      registered.push(tool.name);
    } catch (error) {
      return { ok: false, registered, failure: describe(error) };
    }
  }
  return { ok: true, registered };
}

/** What the tools panel reads back, so a person can see the live surface. */
export function liveTools(): Promise<WebMcpTool[]> {
  const context = getModelContext();
  if (!context?.getTools) return Promise.resolve([]);
  try {
    return Promise.resolve(context.getTools()).catch(() => []);
  } catch {
    return Promise.resolve([]);
  }
}

/** An expected refusal. Returned, never thrown, so the agent can recover. */
export function refuse(code: string, message: string, hint: string): JsonObject {
  return { ok: false, code, message, hint };
}
