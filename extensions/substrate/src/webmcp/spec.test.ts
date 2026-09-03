import { getModelContext, register, type WebMcpTool } from './spec';

describe('legacy WebMCP compatibility', () => {
  it('exposes object schemas and accepts object arguments over the navigator preview API', async () => {
    const nativeTools: any[] = [];
    const nativeContext = Object.assign(new EventTarget(), {
      registerTool: jest.fn(async tool => {
        nativeTools.push(tool);
      }),
      getTools: jest.fn(async () => nativeTools),
      executeTool: jest.fn(async (tool, input) => JSON.stringify(await tool.execute(input))),
    });
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      value: nativeContext,
    });

    const tool: WebMcpTool = {
      name: 'get_context',
      title: 'Get context',
      description: 'Read context.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async input => ({ ok: true, input }),
    };
    const controller = new AbortController();
    expect(await register([tool], controller.signal)).toEqual({
      ok: true,
      registered: ['get_context'],
    });

    expect(nativeTools[0].inputSchema).toBe(JSON.stringify(tool.inputSchema));
    const context = getModelContext();
    const [discovered] = await context!.getTools!();
    expect(discovered.inputSchema).toEqual(tool.inputSchema);
    await expect(context!.executeTool!(discovered, {})).resolves.toBe(
      JSON.stringify({ ok: true, input: {} })
    );
    expect(nativeContext.executeTool).toHaveBeenCalledWith(nativeTools[0], '{}', undefined);

    controller.abort();
    delete (navigator as Navigator & { modelContext?: unknown }).modelContext;
    delete (document as Document & { modelContext?: unknown }).modelContext;
  });
});
