const TEMPLATE_PATTERN = /{{\s*([\w.]+)\s*}}/g;

type TemplateContext = Record<string, unknown>;

export function applyTemplate(template: string, context: TemplateContext): string {
  return template.replace(TEMPLATE_PATTERN, (_, token) => {
    const value = getValue(context, token.trim());
    return value !== undefined && value !== null ? String(value) : '';
  });
}

export function applyTemplateRecord(
  templateRecord: Record<string, string>,
  context: TemplateContext,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(templateRecord).map(([key, value]) => [key, applyTemplate(value, context)]),
  );
}

function getValue(source: TemplateContext, path: string): unknown {
  return path.split('.').reduce<unknown>((prev, current) => {
    if (prev === undefined || prev === null) {
      return undefined;
    }

    if (typeof prev !== 'object') {
      return undefined;
    }

    return (prev as TemplateContext)[current];
  }, source);
}
