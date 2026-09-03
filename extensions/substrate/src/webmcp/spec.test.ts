import {
  detectModelContextCapabilities,
  getModelContext,
  register,
  type JsonObject,
  type RegisteredTool,
  type WebMcpTool,
} from './spec';

type NativeProducer = Omit<WebMcpTool, 'inputSchema' | 'execute'> & {
  inputSchema?: JsonObject | string;
  execute: (input: JsonObject | string, options?: { signal?: AbortSignal }) => Promise<unknown>;
};

type NativeDescriptor = Omit<RegisteredTool, 'inputSchema'> & {
  inputSchema?: JsonObject | string;
};

const originalDocumentContext = Object.getOwnPropertyDescriptor(document, 'modelContext');
const originalNavigatorContext = Object.getOwnPropertyDescriptor(navigator, 'modelContext');

function restoreProperty(
  host: object,
  property: string,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) Object.defineProperty(host, property, descriptor);
  else delete (host as Record<string, unknown>)[property];
}

function setHosts(documentContext?: unknown, navigatorContext?: unknown): void {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: documentContext,
  });
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    value: navigatorContext,
  });
}

function withArity<T extends (...args: any[]) => any>(fn: T, length: number): T {
  Object.defineProperty(fn, 'length', { configurable: true, value: length });
  return fn;
}

function tool(name = 'get_context'): WebMcpTool {
  return {
    name,
    title: 'Get context',
    description: 'Read context.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execute: async (input, options) => ({
      ok: true,
      input,
      aborted: options?.signal.aborted ?? false,
    }),
  };
}

function descriptorFor(definition: NativeProducer): NativeDescriptor {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: definition.annotations,
    window,
    origin: 'https://viewer.example',
  };
}

afterEach(() => {
  restoreProperty(document, 'modelContext', originalDocumentContext);
  restoreProperty(navigator, 'modelContext', originalNavigatorContext);
  jest.restoreAllMocks();
});

describe('WebMCP capability detection', () => {
  it('distinguishes the draft object input from Chromium string input independently of schema', () => {
    const objectExecute = withArity(async (_tool: unknown, _input: unknown = {}) => '', 1);
    const stringExecute = withArity(async (_tool: unknown, _input: unknown) => '', 2);

    expect(
      detectModelContextCapabilities({ executeTool: objectExecute }, [
        { inputSchema: { type: 'object' } },
      ])
    ).toEqual({ registeredSchema: 'object', executeInput: 'object' });
    expect(
      detectModelContextCapabilities({ executeTool: stringExecute }, [
        { inputSchema: { type: 'object' } },
      ])
    ).toEqual({ registeredSchema: 'object', executeInput: 'string' });
    expect(
      detectModelContextCapabilities({ executeTool: stringExecute }, [
        { inputSchema: '{"type":"object"}' },
      ])
    ).toEqual({ registeredSchema: 'string', executeInput: 'string' });
  });
});

describe('WebMCP host compatibility', () => {
  it('uses the current draft document/object contract without replacing native descriptors', async () => {
    const definitions = new Map<string, NativeProducer>();
    const descriptors: NativeDescriptor[] = [];
    const registerTool = jest.fn(
      async (definition: NativeProducer, options?: { signal?: AbortSignal }) => {
        definitions.set(definition.name, definition);
        const descriptor = descriptorFor(definition);
        descriptors.push(descriptor);
        options?.signal?.addEventListener(
          'abort',
          () => {
            definitions.delete(definition.name);
            descriptors.splice(descriptors.indexOf(descriptor), 1);
          },
          { once: true }
        );
      }
    );
    const getTools = jest.fn(async () => descriptors);
    const executeTool = withArity(
      jest.fn(async (registered: NativeDescriptor, input: JsonObject = {}) => {
        const definition = definitions.get(registered.name)!;
        return JSON.stringify(
          await definition.execute(input, { signal: new AbortController().signal })
        );
      }),
      1
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools,
      executeTool,
    });
    setHosts(nativeContext);

    const context = getModelContext()!;
    expect(context).toBe(nativeContext);
    const lifecycle = new AbortController();
    await expect(register([tool()], lifecycle.signal)).resolves.toEqual({
      ok: true,
      registered: ['get_context'],
    });

    const [discovered] = await context.getTools!();
    expect(discovered).toBe(descriptors[0]);
    expect('execute' in discovered).toBe(false);
    await expect(context.executeTool!(discovered, {})).resolves.toContain('"ok":true');
    expect(executeTool.mock.calls[0][0]).toBe(descriptors[0]);
    expect(executeTool.mock.calls[0][1]).toEqual({});

    lifecycle.abort();
    expect(descriptors).toHaveLength(0);
  });

  it('adapts current Chrome document/object-schema metadata to string execution', async () => {
    const definitions = new Map<string, NativeProducer>();
    const descriptors: NativeDescriptor[] = [];
    const registerTool = jest.fn(
      (definition: NativeProducer, options?: { signal?: AbortSignal }) => {
        expect(typeof definition.inputSchema).toBe('object');
        definitions.set(definition.name, definition);
        const descriptor = descriptorFor(definition);
        descriptors.push(descriptor);
        options?.signal?.addEventListener(
          'abort',
          () => descriptors.splice(descriptors.indexOf(descriptor), 1),
          { once: true }
        );
      }
    );
    const getTools = jest.fn(async () => descriptors);
    const executeTool = withArity(
      jest.fn(
        async (registered: NativeDescriptor, input: string, options?: { signal?: AbortSignal }) => {
          if (typeof input !== 'string') {
            throw new DOMException('Failed to parse input arguments', 'UnknownError');
          }
          return JSON.stringify(
            await definitions.get(registered.name)!.execute(input, {
              signal: options?.signal,
            })
          );
        }
      ),
      2
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools,
      executeTool,
    });
    setHosts(nativeContext);

    const context = getModelContext()!;
    expect(context).not.toBe(nativeContext);
    expect((document as Document & { modelContext?: unknown }).modelContext).toBe(context);
    await register([tool()], new AbortController().signal);

    const [discovered] = await context.getTools!();
    expect(discovered).toBe(descriptors[0]);
    expect(discovered.inputSchema).toEqual({ type: 'object', properties: {} });
    expect(discovered.window).toBe(window);
    expect(discovered.origin).toBe('https://viewer.example');
    expect('execute' in discovered).toBe(false);

    const execution = new AbortController();
    await expect(
      context.executeTool!(discovered, {}, { signal: execution.signal })
    ).resolves.toContain('"ok":true');
    expect(executeTool.mock.calls[0][0]).toBe(descriptors[0]);
    expect(executeTool.mock.calls[0][1]).toBe('{}');
    expect(executeTool.mock.calls[0][2]).toEqual({ signal: execution.signal });
  });

  it('keeps registering object schemas when discovery exposes stringified metadata', async () => {
    const definitions = new Map<string, NativeProducer>();
    const descriptors: NativeDescriptor[] = [];
    const registerTool = jest.fn(
      (definition: NativeProducer, options?: { signal?: AbortSignal }) => {
        if (typeof definition.inputSchema !== 'object') {
          throw new TypeError(
            "Failed to read the 'inputSchema' property: Failed to convert value to 'object'."
          );
        }
        definitions.set(definition.name, definition);
        const descriptor = {
          ...descriptorFor(definition),
          inputSchema: JSON.stringify(definition.inputSchema),
        };
        descriptors.push(descriptor);
        options?.signal?.addEventListener(
          'abort',
          () => descriptors.splice(descriptors.indexOf(descriptor), 1),
          { once: true }
        );
      }
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools: jest.fn(async () => descriptors),
      executeTool: withArity(jest.fn(async () => '{}'), 2),
    });
    setHosts(nativeContext);

    const context = getModelContext()!;
    await expect(
      register([tool('first'), tool('second')], new AbortController().signal)
    ).resolves.toEqual({ ok: true, registered: ['first', 'second'] });

    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls.every(call => typeof call[0].inputSchema === 'object')).toBe(
      true
    );
    const discovered = await context.getTools!();
    expect(discovered.map(entry => entry.inputSchema)).toEqual([
      { type: 'object', properties: {} },
      { type: 'object', properties: {} },
    ]);
  });

  it('normalizes a navigator legacy host with string schemas and preserves native identity', async () => {
    const definitions = new Map<string, NativeProducer>();
    const descriptors: NativeDescriptor[] = [];
    const registerTool = jest.fn(
      async (definition: NativeProducer, options?: { signal?: AbortSignal }) => {
        if (typeof definition.inputSchema !== 'string') {
          throw new DOMException('Invalid JSON schema', 'InvalidStateError');
        }
        definitions.set(definition.name, definition);
        const descriptor = descriptorFor(definition);
        descriptors.push(descriptor);
        options?.signal?.addEventListener(
          'abort',
          () => descriptors.splice(descriptors.indexOf(descriptor), 1),
          { once: true }
        );
      }
    );
    const getTools = jest.fn(async () => descriptors);
    const executeTool = withArity(
      jest.fn(async (registered: NativeDescriptor, input: string) => {
        return JSON.stringify(await definitions.get(registered.name)!.execute(input));
      }),
      2
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools,
      executeTool,
    });
    setHosts(undefined, nativeContext);

    const context = getModelContext()!;
    await expect(register([tool()], new AbortController().signal)).resolves.toEqual({
      ok: true,
      registered: ['get_context'],
    });
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(typeof registerTool.mock.calls[0][0].inputSchema).toBe('object');
    expect(typeof registerTool.mock.calls[1][0].inputSchema).toBe('string');

    const nativeDescriptor = descriptors[0];
    const [discovered] = await context.getTools!();
    expect(discovered).not.toBe(nativeDescriptor);
    expect(discovered.inputSchema).toEqual({ type: 'object', properties: {} });
    expect(discovered.window).toBe(window);
    expect(discovered.origin).toBe('https://viewer.example');
    expect('execute' in discovered).toBe(false);

    await expect(context.executeTool!(discovered, {})).resolves.toContain('"ok":true');
    expect(executeTool.mock.calls[0][0]).toBe(nativeDescriptor);
    expect(executeTool.mock.calls[0][1]).toBe('{}');
  });

  it('routes a discovered foreign tool through native execution without inventing a callback', async () => {
    const foreignDescriptor: NativeDescriptor = {
      name: 'foreign_tool',
      title: 'Foreign tool',
      description: 'Owned by another document.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { consequentialHint: true },
      window,
      origin: 'https://foreign.example',
    };
    const executeTool = withArity(
      jest.fn(async (_registered: NativeDescriptor, _input: string) => '{"foreign":true}'),
      2
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: jest.fn(),
      getTools: jest.fn(async () => [foreignDescriptor]),
      executeTool,
    });
    setHosts(nativeContext);

    const context = getModelContext()!;
    const [discovered] = await context.getTools!();
    expect(discovered).toBe(foreignDescriptor);
    expect('execute' in discovered).toBe(false);

    await expect(context.executeTool!(discovered, {})).resolves.toBe('{"foreign":true}');
    expect(executeTool.mock.calls[0][0]).toBe(foreignDescriptor);
    expect(executeTool.mock.calls[0][1]).toBe('{}');
  });

  it('wraps a mixed document/navigator alias once and preserves nullable execution results', async () => {
    const executeTool = withArity(
      jest.fn(async () => null),
      2
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: jest.fn(),
      getTools: jest.fn(async () => []),
      executeTool,
    });
    setHosts(nativeContext, nativeContext);

    const first = getModelContext();
    const second = getModelContext();
    expect(first).toBe(second);
    expect(first).not.toBe(nativeContext);
    expect((document as Document & { modelContext?: unknown }).modelContext).toBe(first);
    expect((navigator as Navigator & { modelContext?: unknown }).modelContext).toBe(nativeContext);

    const registered: RegisteredTool = {
      name: 'navigate',
      description: 'Navigate away.',
      inputSchema: { type: 'object' },
      window,
      origin: 'https://viewer.example',
    };
    await expect(first!.executeTool!(registered, {})).resolves.toBeNull();
  });

  it('forwards native toolchange through both listeners and ontoolchange', () => {
    const executeTool = withArity(
      jest.fn(async () => ''),
      2
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: jest.fn(),
      getTools: jest.fn(async () => []),
      executeTool,
    });
    setHosts(nativeContext);
    const context = getModelContext()!;
    const listener = jest.fn();
    const propertyListener = jest.fn();
    context.addEventListener('toolchange', listener);
    context.ontoolchange = propertyListener;

    nativeContext.dispatchEvent(new Event('toolchange'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(propertyListener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].target).toBe(context);
  });
});

describe('transactional registration', () => {
  it('rolls back every earlier tool when a later registration fails', async () => {
    const registered = new Set<string>();
    const registerTool = jest.fn(
      async (definition: NativeProducer, options?: { signal?: AbortSignal }) => {
        if (definition.name === 'second') {
          throw new DOMException('Duplicate tool name', 'InvalidStateError');
        }
        registered.add(definition.name);
        options?.signal?.addEventListener('abort', () => registered.delete(definition.name), {
          once: true,
        });
      }
    );
    const executeTool = withArity(
      jest.fn(async () => ''),
      1
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools: jest.fn(async () => []),
      executeTool,
    });
    setHosts(nativeContext);

    const result = await register([tool('first'), tool('second')], new AbortController().signal);

    expect(result).toMatchObject({
      ok: false,
      registered: [],
      failure: { kind: 'invalid' },
    });
    expect(registered).toEqual(new Set());
    expect(registerTool.mock.calls[0][1]?.signal).toBe(registerTool.mock.calls[1][1]?.signal);
    expect(registerTool.mock.calls[0][1]?.signal.aborted).toBe(true);
  });

  it('does not start a batch for an already-aborted lifecycle', async () => {
    const registerTool = jest.fn(async () => undefined);
    const executeTool = withArity(
      jest.fn(async () => ''),
      1
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools: jest.fn(async () => []),
      executeTool,
    });
    setHosts(nativeContext);
    const lifecycle = new AbortController();
    lifecycle.abort(new DOMException('Mode exited', 'AbortError'));

    const result = await register([tool()], lifecycle.signal);

    expect(result).toMatchObject({
      ok: false,
      registered: [],
      failure: { kind: 'aborted' },
    });
    expect(registerTool).not.toHaveBeenCalled();
  });

  it('propagates lifecycle cancellation into an in-flight registration', async () => {
    const registerTool = jest.fn(
      (_definition: NativeProducer, options?: { signal?: AbortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        })
    );
    const executeTool = withArity(
      jest.fn(async () => ''),
      1
    );
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool,
      getTools: jest.fn(async () => []),
      executeTool,
    });
    setHosts(nativeContext);
    const lifecycle = new AbortController();

    const pending = register([tool()], lifecycle.signal);
    lifecycle.abort(new DOMException('Mode exited', 'AbortError'));

    await expect(pending).resolves.toMatchObject({
      ok: false,
      registered: [],
      failure: { kind: 'aborted' },
    });
    expect(registerTool.mock.calls[0][1]?.signal.aborted).toBe(true);
  });
});
