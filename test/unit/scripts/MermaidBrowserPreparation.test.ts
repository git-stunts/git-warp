import puppeteer from 'puppeteer';
import { afterEach, expect, it, vi } from 'vitest';
import MermaidBrowserLaunch from '../../../scripts/mermaid/MermaidBrowserLaunch.ts';
import MermaidBrowserCommand from '../../../scripts/mermaid/MermaidBrowserCommand.ts';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('refuses a stalled preparation within its render budget without starting a browser', async () => {
  vi.useFakeTimers();
  vi.spyOn(puppeteer, 'defaultArgs').mockImplementation(() => new Promise(() => {}));
  const command = vi.spyOn(MermaidBrowserCommand.prototype, 'launch');
  const result = new MermaidBrowserLaunch().prepare('output.md', 100, new AbortController().signal);
  const rejected = expect(result).rejects.toThrow('render timed out during browser preparation');
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(command).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['before', 'during'])('honors interruption %s browser preparation without starting a browser', async phase => {
  vi.spyOn(puppeteer, 'defaultArgs').mockImplementation(() => new Promise(() => {}));
  const command = vi.spyOn(MermaidBrowserCommand.prototype, 'launch');
  const interruption = new AbortController();
  if (phase === 'before') { interruption.abort('SIGINT'); }
  const result = new MermaidBrowserLaunch().prepare('output.md', 100, interruption.signal);
  if (phase === 'during') { interruption.abort('SIGTERM'); }
  await expect(result).rejects.toThrow('Mermaid validation interrupted by SIG');
  expect(command).not.toHaveBeenCalled();
});

it('propagates argument preparation failure and clears its deadline', async () => {
  vi.useFakeTimers();
  vi.spyOn(puppeteer, 'defaultArgs').mockRejectedValue(new Error('controlled arguments unavailable'));
  await expect(new MermaidBrowserLaunch().prepare('output.md', 100, new AbortController().signal))
    .rejects.toThrow('controlled arguments unavailable');
  expect(vi.getTimerCount()).toBe(0);
});

it('prepares an immutable browser command using sandboxed defaults when no Docker override is set', async () => {
  vi.stubEnv('GIT_WARP_MERMAID_DISABLE_SANDBOX', '');
  const defaults = vi.spyOn(puppeteer, 'defaultArgs').mockResolvedValue(['--headless=new']);
  vi.spyOn(puppeteer, 'executablePath').mockResolvedValue('browser');
  try {
    const command = await new MermaidBrowserLaunch().prepare('output.md', 100, new AbortController().signal);
    expect(Object.isFrozen(command)).toBe(true);
    expect(defaults).toHaveBeenCalledWith(expect.objectContaining({ browser: 'chrome', args: [] }));
  } finally { vi.unstubAllEnvs(); }
});

it('rejects an empty native executable at construction', () => {
  expect(() => new MermaidBrowserCommand('', [])).toThrow('executable must be nonempty');
});
