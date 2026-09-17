import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.dto';

export const TEMPLATE_KINDS = [
  'Default',
  'Song',
  'Bible',
  'Sermon',
  'Announcement',
  'LowerThird',
  'Countdown',
  'Clock',
] as const;
export const TemplateKindSchema = z.enum(TEMPLATE_KINDS);
export type TemplateKind = z.infer<typeof TemplateKindSchema>;

export const OUTPUT_TARGETS = ['Main', 'Stage', 'Prompter', 'Alpha'] as const;
export const OutputTargetSchema = z.enum(OUTPUT_TARGETS);
export type OutputTarget = z.infer<typeof OutputTargetSchema>;

export const DEFAULT_LAYOUT_NAMES = [
  'Default',
  'Default · Stage',
  'Default · Prompter',
  'Default · Alpha',
] as const;

export function isDefaultLayoutName(name: string): boolean {
  return (DEFAULT_LAYOUT_NAMES as readonly string[]).includes(name);
}

export const CANVAS_ELEMENT_TYPES = [
  'Text',
  'CueTitle',
  'SectionLabel',
  'Image',
  'Video',
  'Shape',
  'Logo',
  'Scripture',
  'Lyrics',
  'NextStep',
  'Timer',
  'Clock',
] as const;
export const CanvasElementTypeSchema = z.enum(CANVAS_ELEMENT_TYPES);
export type CanvasElementType = z.infer<typeof CanvasElementTypeSchema>;

/** Per-view lyric pages. A page contains visual rows; each row joins source line numbers. */
export const LyricPaginationSchema = z
  .object({
    pages: z
      .array(z.array(z.array(z.number().int().positive()).min(1)).min(1))
      .min(1)
      .max(200),
    /** One-based global Live step for each page. Omit for sequential steps. */
    stepMap: z.array(z.number().int().positive()).min(1).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (value.stepMap && value.stepMap.length !== value.pages.length) {
      context.addIssue({
        code: 'custom',
        path: ['stepMap'],
        message: 'stepMap must contain one step for each page',
      });
    }
    if (value.stepMap && new Set(value.stepMap).size !== value.stepMap.length) {
      context.addIssue({
        code: 'custom',
        path: ['stepMap'],
        message: 'Each page must target a different Live step',
      });
    }
  });
export type LyricPaginationDto = z.infer<typeof LyricPaginationSchema>;

/** Coordinates are normalized to a 0–100 design surface, never output pixels. */
export const CanvasElementSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: CanvasElementTypeSchema,
  x: z.number().min(-100).max(200),
  y: z.number().min(-100).max(200),
  width: z.number().min(0.1).max(200),
  height: z.number().min(0.1).max(200),
  zIndex: z.number().int().min(0).max(999),
  style: z.record(z.string(), z.unknown()).default({}),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type CanvasElementDto = z.infer<typeof CanvasElementSchema>;

/** The authored output surface. Elements use normalized coordinates inside it. */
export const CanvasSizeSchema = z
  .object({
    width: z.number().int().min(240).max(7680),
    height: z.number().int().min(240).max(7680),
    orientation: z.enum(['H', 'V']),
  })
  .refine(
    (size) =>
      size.orientation === 'H'
        ? size.width >= size.height
        : size.height >= size.width,
    { message: 'Canvas resolution must match its orientation' },
  );
export type CanvasSizeDto = z.infer<typeof CanvasSizeSchema>;

export const CanvasLayoutSchema = z.object({
  version: z.literal(1),
  size: CanvasSizeSchema.default({
    width: 1920,
    height: 1080,
    orientation: 'H',
  }),
  background: z.record(z.string(), z.unknown()).default({}),
  elements: z.array(CanvasElementSchema).max(100),
});
export type CanvasLayoutDto = z.infer<typeof CanvasLayoutSchema>;

/**
 * Maps every view's lyric pages onto one shared, source-line timeline.
 * A view that groups lines 1-3 and 4-6 therefore changes at global steps 1
 * and 4 when another view exposes one source line per step.
 */
export function synchronizeSongLayoutStepMaps(
  layouts: readonly CanvasLayoutDto[],
): CanvasLayoutDto[] {
  const boundaries = new Set<number>();
  for (const layout of layouts) {
    for (const element of layout.elements) {
      if (element.type !== 'Lyrics') continue;
      const pagination = LyricPaginationSchema.safeParse(
        element.data['lyricPagination'],
      );
      if (!pagination.success) continue;
      for (const page of pagination.data.pages) {
        const firstLine = Math.min(...page.flat());
        if (Number.isFinite(firstLine)) boundaries.add(firstLine);
      }
    }
  }
  const ordered = [...boundaries].sort((left, right) => left - right);
  if (!ordered.length) return layouts.map((layout) => ({ ...layout }));
  const stepForLine = new Map(ordered.map((line, index) => [line, index + 1]));
  return layouts.map((layout) => ({
    ...layout,
    elements: layout.elements.map((element) => {
      if (element.type !== 'Lyrics') return element;
      const pagination = LyricPaginationSchema.safeParse(
        element.data['lyricPagination'],
      );
      if (!pagination.success) return element;
      const stepMap = pagination.data.pages.map(
        (page) => stepForLine.get(Math.min(...page.flat())) ?? 1,
      );
      return {
        ...element,
        data: {
          ...element.data,
          lyricPagination: { ...pagination.data, stepMap },
        },
      };
    }),
  }));
}

/** Rebuilds one output View from the canonical SongStep sequence. */
export function applySongStepPagination(
  layout: CanvasLayoutDto,
  steps: readonly { position: number; lines: readonly string[] }[],
): CanvasLayoutDto {
  return {
    ...layout,
    elements: layout.elements.map((element) => {
      if (element.type !== 'Lyrics' || !steps.length) return element;
      const configured = element.data['stepsPerSlide'];
      const legacy = element.data['linesPerStep'];
      const stepsPerSlide =
        typeof configured === 'number'
          ? configured
          : typeof legacy === 'number'
            ? Math.max(1, Math.ceil(legacy / 2))
            : 1;
      if (!Number.isInteger(stepsPerSlide) || stepsPerSlide < 1) return element;

      let lineOffset = 0;
      const stepLines = steps.map((step) => {
        const indices = step.lines.map((_, index) => lineOffset + index + 1);
        lineOffset += step.lines.length;
        return indices;
      });
      const pages: number[][][] = [];
      const stepMap: number[] = [];
      for (let index = 0; index < steps.length; index += stepsPerSlide) {
        pages.push(
          stepLines
            .slice(index, index + stepsPerSlide)
            .flat()
            .map((line) => [line]),
        );
        stepMap.push(steps[index].position + 1);
      }
      return {
        ...element,
        data: {
          ...element.data,
          stepsPerSlide,
          lyricPagination: { pages, stepMap },
          lyricPaginationAutoFit: false,
        },
      };
    }),
  };
}

/** The persistent starting layout for a new organization and for legacy workspaces. */
export function defaultCanvasLayout(
  target: OutputTarget = 'Main',
  kind: TemplateKind = 'Default',
): CanvasLayoutDto {
  const type: CanvasElementType =
    kind === 'Song'
      ? 'Lyrics'
      : kind === 'Bible'
        ? 'Scripture'
        : kind === 'Countdown'
          ? 'Timer'
          : kind === 'Clock'
            ? 'Clock'
            : 'Text';
  const baseBackground = {
    kind: 'gradient',
    color: '#070907',
    gradient:
      'radial-gradient(circle at 42% 40%, #243316 0%, #11180d 42%, #050706 100%)',
  };
  if (kind === 'Song' || kind === 'Default') {
    const presets: Record<OutputTarget, CanvasLayoutDto> = {
      Main: {
        version: 1,
        size: { width: 1920, height: 1080, orientation: 'H' },
        background: baseBackground,
        elements: [
          {
            id: 'lyrics',
            type: 'Lyrics',
            x: 8,
            y: 28,
            width: 84,
            height: 44,
            zIndex: 1,
            style: {
              color: '#ffffff',
              fontSize: 6,
              fontFamily: 'Georgia',
              textAlign: 'center',
              verticalAlign: 'center',
            },
            data: { stepsPerSlide: 3 },
          },
        ],
      },
      Stage: {
        version: 1,
        size: { width: 1920, height: 1080, orientation: 'H' },
        background: baseBackground,
        elements: [
          {
            id: 'section-label',
            type: 'SectionLabel',
            x: 5,
            y: 5,
            width: 26,
            height: 6,
            zIndex: 1,
            style: {
              color: '#c3f04a',
              fontSize: 1.4,
              fontFamily: 'system-ui',
              textAlign: 'left',
              verticalAlign: 'center',
            },
            data: { prefix: 'CURRENT · ' },
          },
          {
            id: 'cue-title',
            type: 'CueTitle',
            x: 5,
            y: 12,
            width: 66,
            height: 16,
            zIndex: 1,
            style: {
              color: '#ffffff',
              fontSize: 5.5,
              fontFamily: 'Georgia',
              textAlign: 'left',
              verticalAlign: 'center',
            },
            data: {},
          },
          {
            id: 'lyrics',
            type: 'Lyrics',
            x: 5,
            y: 34,
            width: 72,
            height: 50,
            zIndex: 1,
            style: {
              color: '#ffffff',
              fontSize: 3.7,
              fontFamily: 'system-ui',
              textAlign: 'left',
              verticalAlign: 'top',
            },
            data: { stepsPerSlide: 2 },
          },
          {
            id: 'clock',
            type: 'Clock',
            x: 80,
            y: 5,
            width: 15,
            height: 7,
            zIndex: 1,
            style: {
              color: '#dfe9d5',
              fontSize: 2.4,
              fontFamily: 'ui-monospace',
              textAlign: 'right',
            },
            data: { format: 'time' },
          },
          {
            id: 'timer',
            type: 'Timer',
            x: 80,
            y: 14,
            width: 15,
            height: 7,
            zIndex: 1,
            style: {
              color: '#c3f04a',
              fontSize: 2.4,
              fontFamily: 'ui-monospace',
              textAlign: 'right',
            },
            data: {},
          },
        ],
      },
      Prompter: {
        version: 1,
        size: { width: 1920, height: 1080, orientation: 'H' },
        background: baseBackground,
        elements: [
          {
            id: 'section-label',
            type: 'SectionLabel',
            x: 4,
            y: 5,
            width: 24,
            height: 5,
            zIndex: 1,
            style: {
              color: '#c3f04a',
              fontSize: 1.25,
              fontFamily: 'system-ui',
              textAlign: 'left',
            },
            data: { prefix: 'CURRENT · ' },
          },
          {
            id: 'cue-title',
            type: 'CueTitle',
            x: 4,
            y: 10,
            width: 59,
            height: 23,
            zIndex: 1,
            style: {
              color: '#ffffff',
              fontSize: 7.5,
              fontFamily: 'Georgia',
              textAlign: 'left',
              verticalAlign: 'center',
            },
            data: {},
          },
          {
            id: 'lyrics',
            type: 'Lyrics',
            x: 5,
            y: 38,
            width: 57,
            height: 49,
            zIndex: 1,
            style: {
              color: '#ffffff',
              fontSize: 3.2,
              fontFamily: 'system-ui',
              textAlign: 'left',
              verticalAlign: 'top',
            },
            data: { stepsPerSlide: 1 },
          },
          {
            id: 'next-step',
            type: 'NextStep',
            x: 67,
            y: 8,
            width: 29,
            height: 36,
            zIndex: 2,
            style: {
              color: '#e9f1e2',
              fontSize: 2.15,
              fontFamily: 'system-ui',
              textAlign: 'left',
              verticalAlign: 'top',
              backgroundColor: '#050706',
              borderColor: '#2d3a24',
              padding: 2.4,
            },
            data: { label: 'NEXT STEP' },
          },
          {
            id: 'clock',
            type: 'Clock',
            x: 80,
            y: 3,
            width: 16,
            height: 4,
            zIndex: 3,
            style: {
              color: '#c8d3bf',
              fontSize: 1.6,
              fontFamily: 'ui-monospace',
              textAlign: 'right',
            },
            data: { format: 'time' },
          },
          {
            id: 'timer',
            type: 'Timer',
            x: 67,
            y: 47,
            width: 29,
            height: 8,
            zIndex: 2,
            style: {
              color: '#c3f04a',
              fontSize: 2.4,
              fontFamily: 'ui-monospace',
              textAlign: 'right',
            },
            data: {},
          },
        ],
      },
      Alpha: {
        version: 1,
        size: { width: 1920, height: 1080, orientation: 'H' },
        background: { kind: 'color', color: 'transparent' },
        elements: [
          {
            id: 'lyrics',
            type: 'Lyrics',
            x: 6,
            y: 68,
            width: 88,
            height: 24,
            zIndex: 1,
            style: {
              color: '#ffffff',
              fontSize: 4.2,
              fontFamily: 'system-ui',
              textAlign: 'center',
              verticalAlign: 'center',
            },
            data: {
              stepsPerSlide: 1,
              stepGenerator: {
                maxLinesPerStep: 2,
                maxCharsPerLine: 42,
                minCharsPerStep: 12,
                mergeShortLines: false,
              },
            },
          },
        ],
      },
    };
    const preset = presets[target];
    return kind === 'Default'
      ? {
          ...preset,
          elements: preset.elements.map((element) =>
            element.id === 'lyrics'
              ? {
                  ...element,
                  id: 'primary-content',
                  data: { ...element.data, binding: 'primary' },
                }
              : element,
          ),
        }
      : preset;
  }
  return {
    version: 1,
    size: { width: 1920, height: 1080, orientation: 'H' },
    background: baseBackground,
    elements: [
      {
        id: type.toLowerCase(),
        type,
        x: 10,
        y: 36,
        width: 80,
        height: 28,
        zIndex: 1,
        style: {
          color: '#ffffff',
          fontSize: 7,
          fontFamily: 'Georgia',
          textAlign: 'center',
        },
        data: type === 'Text' ? { text: 'Your content' } : {},
      },
    ],
  };
}

/** Applies one output-level Default layout to the content carried by a cue. */
export function adaptDefaultCanvasLayout(
  layout: CanvasLayoutDto,
  type:
    | 'Song'
    | 'Bible'
    | 'Slide'
    | 'Image'
    | 'Video'
    | 'Audio'
    | 'Countdown'
    | 'Clock'
    | 'Sermon'
    | 'Text'
    | 'Blank',
): CanvasLayoutDto {
  const primaryType: CanvasElementType =
    type === 'Song'
      ? 'Lyrics'
      : type === 'Bible'
        ? 'Scripture'
        : type === 'Image'
          ? 'Image'
          : type === 'Video'
            ? 'Video'
            : type === 'Countdown'
              ? 'Timer'
              : type === 'Clock'
                ? 'Clock'
                : 'CueTitle';
  return {
    ...layout,
    elements: layout.elements.flatMap((element) => {
      const isPrimary =
        element.data['binding'] === 'primary' ||
        element.id === 'primary-content' ||
        element.id === 'lyrics';
      if (!isPrimary) return [element];
      if (type === 'Blank') return [];
      return [{ ...element, type: primaryType }];
    }),
  };
}

/** True when a view keeps its template structure and changes only element placement. */
export function isCanvasPositionOnlyOverride(
  base: CanvasLayoutDto,
  override: CanvasLayoutDto,
): boolean {
  if (
    base.version !== override.version ||
    !sameCanvasJson(base.size, override.size) ||
    !sameCanvasJson(base.background, override.background)
  )
    return false;
  if (base.elements.length !== override.elements.length) return false;
  const baseById = new Map(
    base.elements.map((element) => [element.id, element]),
  );
  return override.elements.every((element) => {
    const source = baseById.get(element.id);
    return Boolean(
      source &&
      source.type === element.type &&
      source.zIndex === element.zIndex &&
      sameCanvasJson(source.style, element.style) &&
      sameCanvasViewData(source, element),
    );
  });
}

/** Song views inherit their Settings layout. They may persist only lyric page grouping. */
export function isCanvasLyricPaginationOverride(
  base: CanvasLayoutDto,
  child: CanvasLayoutDto,
): boolean {
  if (
    base.version !== child.version ||
    !sameCanvasJson(base.size, child.size) ||
    !sameCanvasJson(base.background, child.background)
  )
    return false;
  if (base.elements.length !== child.elements.length) return false;
  const baseById = new Map(
    base.elements.map((element) => [element.id, element]),
  );
  return child.elements.every((element) => {
    const source = baseById.get(element.id);
    if (
      !source ||
      source.type !== element.type ||
      source.x !== element.x ||
      source.y !== element.y ||
      source.width !== element.width ||
      source.height !== element.height ||
      source.zIndex !== element.zIndex ||
      !sameCanvasJson(source.style, element.style)
    )
      return false;
    if (source.type !== 'Lyrics')
      return sameCanvasJson(source.data, element.data);
    return sameCanvasViewData(source, element);
  });
}

/** Per-cue lyric pages may differ by output while the template keeps ownership of all other data. */
function sameCanvasViewData(
  source: CanvasElementDto,
  override: CanvasElementDto,
): boolean {
  if (source.type !== 'Lyrics')
    return sameCanvasJson(source.data, override.data);
  const sourceData = { ...source.data };
  const overrideData = { ...override.data };
  delete sourceData['lyricPagination'];
  delete sourceData['lyricPaginationAutoFit'];
  delete overrideData['lyricPagination'];
  delete overrideData['lyricPaginationAutoFit'];
  return sameCanvasJson(sourceData, overrideData);
}

function sameCanvasJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameCanvasJson(value, right[index]))
    );
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  )
    return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        sameCanvasJson(leftRecord[key], rightRecord[key]),
    )
  );
}

export const SlideBlockSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.enum([
    'Text',
    'CueTitle',
    'SectionLabel',
    'Image',
    'Video',
    'Scripture',
    'Lyrics',
    'NextStep',
    'Timer',
    'Clock',
  ]),
  data: z.record(z.string(), z.unknown()),
});
export type SlideBlockDto = z.infer<typeof SlideBlockSchema>;

export const SlideContentSchema = z.object({
  blocks: z.array(SlideBlockSchema).min(1).max(100),
  /** A reusable source canvas. A cue may still override it with output-specific views. */
  layout: CanvasLayoutSchema.optional(),
});
export type SlideContentDto = z.infer<typeof SlideContentSchema>;

const SlideTemplateInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: TemplateKindSchema,
  target: OutputTargetSchema,
  /** A view template is always an authored canvas, never an untyped JSON blob. */
  layout: CanvasLayoutSchema,
});

export const CreateSlideTemplateRequestSchema = SlideTemplateInputSchema.extend(
  { target: OutputTargetSchema.default('Main') },
);
export type CreateSlideTemplateRequestDto = z.infer<
  typeof CreateSlideTemplateRequestSchema
>;

export const UpdateSlideTemplateRequestSchema =
  SlideTemplateInputSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    { message: 'At least one field is required' },
  );
export type UpdateSlideTemplateRequestDto = z.infer<
  typeof UpdateSlideTemplateRequestSchema
>;

export const SlideTemplateSchema = CreateSlideTemplateRequestSchema.extend({
  id: IdSchema,
  organizationId: IdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SlideTemplateDto = z.infer<typeof SlideTemplateSchema>;

export const CreateSlideRequestSchema = z.object({
  name: z.string().trim().min(1).max(180),
  templateId: IdSchema.nullable().optional(),
  content: SlideContentSchema,
  notes: z.string().trim().max(5000).optional(),
});
export type CreateSlideRequestDto = z.infer<typeof CreateSlideRequestSchema>;

export const UpdateSlideRequestSchema = CreateSlideRequestSchema.partial()
  .extend({
    templateId: IdSchema.nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateSlideRequestDto = z.infer<typeof UpdateSlideRequestSchema>;

export const SlideDocumentSchema = CreateSlideRequestSchema.extend({
  id: IdSchema,
  organizationId: IdSchema,
  template: SlideTemplateSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type SlideDocumentDto = z.infer<typeof SlideDocumentSchema>;

export const SlideListQuerySchema = z.object({
  search: z.string().trim().max(180).optional(),
});
export type SlideListQueryDto = z.infer<typeof SlideListQuerySchema>;
