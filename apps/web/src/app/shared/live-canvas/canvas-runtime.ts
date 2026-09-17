import type {
  CanvasElementDto,
  LiveCueDto,
  OutputTarget,
} from '@worship/shared-dto';

export interface ResolveSongCanvasTextOptions {
  readonly visualSlideId?: string | null;
  readonly visualStep?: number | null;
  readonly element?: CanvasElementDto;
}

/** Resolves dynamic song text from the same Live timeline used by the control room. */
export function resolveSongCanvasText(
  cue: LiveCueDto,
  target: OutputTarget,
  binding: 'current' | 'next',
  options: ResolveSongCanvasTextOptions = {},
): string {
  const song = asRecord(cue.content['song']);
  const slides = asArray(song?.['visualSlides'])
    .flatMap(normalizeSlide)
    .sort((left, right) => left.position - right.position);
  const sections = asArray(song?.['sections']).flatMap(normalizeSection);
  const activeSlide = asRecord(song?.['activeVisualSlide']);
  const slideId =
    options.visualSlideId ??
    (typeof activeSlide?.['id'] === 'string'
      ? activeSlide['id']
      : cue.visualSlideId);
  const currentIndex = slides.findIndex((slide) => slide.id === slideId);
  if (currentIndex < 0) return '';
  const currentStep = options.visualStep ?? cue.visualStep;
  const reference =
    binding === 'current'
      ? { slide: slides[currentIndex], step: currentStep }
      : nextReference(slides, currentIndex, currentStep, target);
  if (!reference) return '';
  const section = sections.find(
    (item) => item.id === reference.slide.sectionId,
  );
  if (!section) return '';
  const layout = reference.slide.layouts.find(
    (item) => item.target === target,
  )?.layout;
  if (!layout) return '';
  const element =
    binding === 'current' && options.element?.type === 'Lyrics'
      ? options.element
      : layout.elements.find((item) => item.type === 'Lyrics');
  return element
    ? renderLyrics(section, element, reference.step, reference.slide)
    : '';
}

interface RuntimeLayout {
  readonly target: OutputTarget;
  readonly layout: { readonly elements: readonly CanvasElementDto[] };
}

interface RuntimeSlide {
  readonly id: string;
  readonly sectionId: string;
  readonly position: number;
  readonly layouts: readonly RuntimeLayout[];
}

interface RuntimeSection {
  readonly id: string;
  readonly content: string;
  readonly steps: readonly { readonly position: number; readonly lines: readonly string[] }[];
}

function nextReference(
  slides: readonly RuntimeSlide[],
  currentIndex: number,
  currentStep: number,
  target: OutputTarget,
): { slide: RuntimeSlide; step: number } | null {
  const current = slides[currentIndex];
  const laterStep = stepsForTarget(current, target).find(
    (step) => step > currentStep,
  );
  if (laterStep !== undefined) return { slide: current, step: laterStep };
  for (const nextSlide of slides.slice(currentIndex + 1)) {
    const firstStep = stepsForTarget(nextSlide, target)[0];
    if (firstStep !== undefined) return { slide: nextSlide, step: firstStep };
  }
  return null;
}

function stepsForTarget(
  slide: RuntimeSlide,
  target: OutputTarget,
): readonly number[] {
  const steps = new Set<number>();
  for (const { layout } of slide.layouts.filter(
    (item) => item.target === target,
  )) {
    for (const element of layout.elements) {
      if (element.type !== 'Lyrics') continue;
      const pagination = lyricPagination(element);
      if (!pagination) {
        steps.add(0);
        continue;
      }
      effectiveStepMap(pagination, slide).forEach((step) =>
        steps.add(step - 1),
      );
    }
  }
  return [...steps].sort((left, right) => left - right);
}

function renderLyrics(
  section: RuntimeSection,
  element: CanvasElementDto,
  step: number,
  slide: RuntimeSlide,
): string {
  const pagination = lyricPagination(element);
  if (!pagination) return section.content;
  const requested = step + 1;
  const pageIndex = effectiveStepMap(pagination, slide).reduce(
    (latest, mapped, index) => (mapped <= requested ? index : latest),
    -1,
  );
  const page = pageIndex < 0 ? undefined : pagination.pages[pageIndex];
  if (!page) return '';
  const generatedLines = section.steps.flatMap((item) => item.lines);
  const lines = generatedLines.length
    ? generatedLines
    : section.content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return page
    .map((row) =>
      row
        .map((line) => lines[line - 1])
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * The server broadcasts one section-local step. Every output resolves that
 * shared step against its own pages. New layouts persist the canonical step
 * at which each page starts; legacy pages fall back to their page sequence.
 */
function effectiveStepMap(
  pagination: { pages: number[][][]; stepMap?: number[] },
  slide: RuntimeSlide,
): number[] {
  if (pagination.stepMap?.length === pagination.pages.length)
    return pagination.stepMap;
  const stepForLine = new Map(
    sourceBoundaries(slide).map((line, index) => [line, index + 1]),
  );
  return pagination.pages.map(
    (page) => stepForLine.get(Math.min(...page.flat())) ?? 1,
  );
}

function sourceBoundaries(slide: RuntimeSlide): number[] {
  const boundaries = new Set<number>();
  for (const { layout } of slide.layouts) {
    for (const element of layout.elements) {
      if (element.type !== 'Lyrics') continue;
      const pagination = lyricPagination(element);
      if (!pagination) continue;
      for (const page of pagination.pages) {
        const firstLine = Math.min(...page.flat());
        if (Number.isFinite(firstLine)) boundaries.add(firstLine);
      }
    }
  }
  if (!boundaries.size) boundaries.add(1);
  return [...boundaries].sort((left, right) => left - right);
}

function lyricPagination(
  element: CanvasElementDto,
): { pages: number[][][]; stepMap?: number[] } | null {
  const value = asRecord(element.data['lyricPagination']);
  const rawPages = value?.['pages'];
  if (!Array.isArray(rawPages)) return null;
  const pages = rawPages.flatMap((page) => {
    if (!Array.isArray(page)) return [];
    const rows = page.flatMap((row) =>
      Array.isArray(row) && row.every((line) => typeof line === 'number')
        ? [row as number[]]
        : [],
    );
    return rows.length === page.length && rows.length ? [rows] : [];
  });
  if (!pages.length) return null;
  const rawStepMap = value?.['stepMap'];
  const stepMap =
    Array.isArray(rawStepMap) &&
    rawStepMap.length === pages.length &&
    rawStepMap.every((step) => typeof step === 'number')
      ? (rawStepMap as number[])
      : undefined;
  return { pages, ...(stepMap ? { stepMap } : {}) };
}

function normalizeSlide(value: unknown): RuntimeSlide[] {
  const record = asRecord(value);
  if (
    !record ||
    typeof record['id'] !== 'string' ||
    typeof record['sectionId'] !== 'string' ||
    typeof record['position'] !== 'number'
  )
    return [];
  const layouts = asArray(record['layouts']).flatMap(
    (item): RuntimeLayout[] => {
      const layoutRecord = asRecord(item);
      const target = layoutRecord?.['target'];
      const canvas = asRecord(layoutRecord?.['layout']);
      if (
        (target !== 'Main' &&
          target !== 'Stage' &&
          target !== 'Prompter' &&
          target !== 'Alpha') ||
        !Array.isArray(canvas?.['elements'])
      )
        return [];
      return [
        {
          target,
          layout: { elements: canvas['elements'] as CanvasElementDto[] },
        },
      ];
    },
  );
  return [
    {
      id: record['id'],
      sectionId: record['sectionId'],
      position: record['position'],
      layouts,
    },
  ];
}

function normalizeSection(value: unknown): RuntimeSection[] {
  const record = asRecord(value);
  return record &&
    typeof record['id'] === 'string' &&
    typeof record['content'] === 'string'
    ? [{
        id: record['id'],
        content: record['content'],
        steps: asArray(record['steps']).flatMap((value) => {
          const step = asRecord(value);
          return step &&
            typeof step['position'] === 'number' &&
            Array.isArray(step['lines']) &&
            step['lines'].every((line) => typeof line === 'string')
            ? [{ position: step['position'], lines: step['lines'] as string[] }]
            : [];
        }),
      }]
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
