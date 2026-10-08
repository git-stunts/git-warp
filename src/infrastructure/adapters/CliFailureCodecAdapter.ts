import type CliFailureNode from './CliFailureNode.ts';
import type CliFailureReport from './CliFailureReport.ts';
import type { CliFailureNodeValue } from './CliFailureNodeValue.ts';
import type { CliFailureFormat } from './CliFailureFormat.ts';
import { CLI_FAILURE_OUTPUT_BYTES } from './CliFailureLimits.ts';

/** Encodes only owned display values and checks the complete emitted byte count. */
export default class CliFailureCodecAdapter {
  encode(report: CliFailureReport, format: CliFailureFormat): string {
    const rendered = format === 'human' ? human(report) : machine(report, format);
    if (new TextEncoder().encode(rendered).length <= CLI_FAILURE_OUTPUT_BYTES) {
      return rendered;
    }
    // Retain primary classification even when details exceed the display budget.
    return emergency(report, format);
  }
}

function emergency(report: CliFailureReport, format: CliFailureFormat): string {
    const fallback = { error: {
      code: report.code,
      message: 'Further failure details omitted to fit the display limit',
      truncated: true,
      ...typedCode(report),
    } };
    return format === 'human'
      ? `Error: [${humanCode(report)}] ${fallback.error.message}\n`
      : `${JSON.stringify(fallback, null, indentation(format))}\n`;
}

function indentation(format: CliFailureFormat): number | undefined {
  return format === 'json' ? 2 : undefined;
}

function machine(report: CliFailureReport, format: CliFailureFormat): string {
  const causes = [...report.primary.causes, ...report.cleanup];
  const payload = { error: {
    ...(report.cause === undefined ? {} : { cause: report.cause }),
    ...(causes.length === 0 ? {} : { causes: causes.map(nodeValue) }),
    code: report.code,
    message: report.primary.message,
    ...truncation(report),
    ...typedCode(report),
  } };
  return `${JSON.stringify(payload, null, indentation(format))}\n`;
}

function nodeValue(node: CliFailureNode): CliFailureNodeValue {
  return {
    causes: node.causes.map(nodeValue), code: node.code, message: node.message,
    relation: node.relation, truncated: node.truncated,
  };
}

function human(report: CliFailureReport): string {
  const root = `Error: [${humanCode(report)}] ${report.primary.message}`;
  const causes = [...report.primary.causes, ...report.cleanup];
  const omission = truncation(report).truncated === true ? ['Further failure details omitted'] : [];
  return `${[root, ...causes.flatMap((node) => humanNode(node, 1)), ...omission].join('\n')}\n`;
}

function humanNode(node: CliFailureNode, depth: number): string[] {
  const line = `${'  '.repeat(depth)}${node.relation} [${node.code}]: ${node.message}`;
  return [line, ...node.causes.flatMap((child) => humanNode(child, depth + 1))];
}

function typedCode(report: CliFailureReport): { readonly typedCode?: string } {
  return report.primary.code === report.code ? {} : { typedCode: report.primary.code };
}

function truncation(report: CliFailureReport): { readonly truncated?: boolean } {
  return report.primary.truncated || report.truncated ? { truncated: true } : {};
}

function humanCode(report: CliFailureReport): string {
  return report.primary.code === report.code
    ? report.code : `${report.code}/${report.primary.code}`;
}
