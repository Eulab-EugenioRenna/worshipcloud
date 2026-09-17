import assert from 'node:assert/strict';
import {
  applySongStepPagination,
  defaultCanvasLayout,
  generateSongSectionSteps,
  liveBibleVerseAtStep,
  UpdateSlideTemplateRequestSchema,
} from '@worship/shared-dto';
import type { LiveCueDto } from '../packages/shared/dto/src/index.ts';
import { resolveSongCanvasText } from '../apps/web/src/app/shared/live-canvas/canvas-runtime.ts';

const layout = (pages: number[][][]) => ({
  version: 1 as const,
  size: { width: 1920, height: 1080, orientation: 'H' as const },
  background: { kind: 'color', color: '#000000' },
  elements: [
    {
      id: 'lyrics',
      type: 'Lyrics' as const,
      x: 5,
      y: 10,
      width: 90,
      height: 80,
      zIndex: 1,
      style: {},
      data: { lyricPagination: { pages } },
    },
  ],
});

assert.deepEqual(
  UpdateSlideTemplateRequestSchema.parse({
    layout: defaultCanvasLayout('Prompter', 'Default'),
  }),
  { layout: defaultCanvasLayout('Prompter', 'Default') },
  'a canvas-only Default restore must not inject the Main target',
);

const completePrompterLayout = applySongStepPagination(
  defaultCanvasLayout('Prompter', 'Default'),
  [
    { position: 0, lines: ['Line 1', 'Line 2'] },
    { position: 1, lines: ['Line 3', 'Line 4'] },
    { position: 2, lines: ['Line 5', 'Line 6'] },
  ],
);
const completePrompterLyrics = completePrompterLayout.elements.find(
  (element) => element.type === 'Lyrics',
);
assert.deepEqual(
  completePrompterLyrics?.data['lyricPagination'],
  {
    pages: [
      [[1], [2]],
      [[3], [4]],
      [[5], [6]],
    ],
    stepMap: [1, 2, 3],
  },
  'derived View pages must include every canonical lyric line',
);

const synchronizedLayout = (pages: number[][][], stepMap: number[]) => ({
  ...layout(pages),
  elements: layout(pages).elements.map((element) => ({
    ...element,
    data: { lyricPagination: { pages, stepMap } },
  })),
});

const cue = {
  lineupItemId: 'lineup-1',
  type: 'Song',
  title: 'Song',
  sourceId: 'song-1',
  notes: null,
  sectionPosition: 0,
  visualSlideId: 'slide-1',
  visualStep: 0,
  lineupVisualSlideId: null,
  content: {
    song: {
      id: 'song-1',
      title: 'Song',
      locale: 'it',
      sections: [
        {
          id: 'section-1',
          label: 'Verse 1',
          type: 'Verse',
          content: 'Line one\nLine two\nLine three\nLine four',
          position: 0,
        },
        {
          id: 'section-2',
          label: 'Chorus',
          type: 'Chorus',
          content: 'Chorus one\nChorus two',
          position: 1,
        },
      ],
      activeSection: {
        label: 'Verse 1',
        type: 'Verse',
        content: 'Line one\nLine two\nLine three\nLine four',
        position: 0,
      },
      visualSlides: [
        {
          id: 'slide-1',
          sectionId: 'section-1',
          name: 'Verse 1',
          position: 0,
          layouts: [
            {
              target: 'Prompter',
              layout: layout([
                [[1], [2]],
                [[3], [4]],
              ]),
            },
          ],
        },
        {
          id: 'slide-2',
          sectionId: 'section-2',
          name: 'Chorus',
          position: 1,
          layouts: [{ target: 'Prompter', layout: layout([[[1], [2]]]) }],
        },
      ],
      activeVisualSlide: {
        id: 'slide-1',
        sectionId: 'section-1',
        layouts: [
          {
            target: 'Prompter',
            layout: layout([
              [[1], [2]],
              [[3], [4]],
            ]),
          },
        ],
      },
    },
  },
} as unknown as LiveCueDto;

assert.equal(
  resolveSongCanvasText(cue, 'Prompter', 'current'),
  'Line one\nLine two',
);
assert.equal(
  resolveSongCanvasText(cue, 'Prompter', 'next'),
  'Line three\nLine four',
);
assert.equal(
  resolveSongCanvasText(cue, 'Prompter', 'next', { visualStep: 1 }),
  'Chorus one\nChorus two',
);

const synchronizedCue = {
  ...cue,
  visualStep: 2,
  content: {
    song: {
      ...cue.content.song,
      sections: [
        {
          id: 'section-sync',
          label: 'Verse 1',
          type: 'Verse',
          content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
          position: 0,
        },
      ],
      activeSection: {
        label: 'Verse 1',
        type: 'Verse',
        content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
        position: 0,
      },
      visualSlides: [
        {
          id: 'slide-sync',
          sectionId: 'section-sync',
          name: 'Verse 1',
          position: 0,
          layouts: [
            {
              target: 'Main',
              layout: layout([
                [[1], [2], [3]],
                [[4], [5], [6]],
              ]),
            },
            {
              target: 'Prompter',
              layout: layout([[[1]], [[2]], [[3]], [[4]], [[5]], [[6]]]),
            },
            {
              target: 'Stage',
              layout: synchronizedLayout(
                [
                  [[1], [2]],
                  [[3], [4]],
                  [[5], [6]],
                ],
                [1, 3, 5],
              ),
            },
          ],
        },
      ],
      activeVisualSlide: {
        id: 'slide-sync',
        sectionId: 'section-sync',
        layouts: [
          {
            target: 'Main',
            layout: layout([
              [[1], [2], [3]],
              [[4], [5], [6]],
            ]),
          },
          {
            target: 'Prompter',
            layout: layout([[[1]], [[2]], [[3]], [[4]], [[5]], [[6]]]),
          },
          {
            target: 'Stage',
            layout: synchronizedLayout(
              [
                [[1], [2]],
                [[3], [4]],
                [[5], [6]],
              ],
              [1, 3, 5],
            ),
          },
        ],
      },
    },
  },
} as unknown as LiveCueDto;

assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Main', 'current'),
  'Line 1\nLine 2\nLine 3',
  'Main must hold its first page through global Step 3',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Prompter', 'current'),
  'Line 3',
  'Prompter must resolve global Step 3 to its third page',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Main', 'next', { visualStep: 0 }),
  'Line 4\nLine 5\nLine 6',
  'Main Next must show its next page, not the next global step',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Prompter', 'next', {
    visualStep: 0,
  }),
  'Line 2',
  'Prompter Next must follow its own one-line pagination',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Stage', 'current', {
    visualStep: 1,
  }),
  'Line 1\nLine 2',
  'Stage must hold a two-line page until its next boundary',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Stage', 'next', { visualStep: 1 }),
  'Line 3\nLine 4',
  'Stage Next must use its own two-line pagination',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Main', 'current', {
    visualStep: 3,
  }),
  'Line 4\nLine 5\nLine 6',
  'Main must advance when global Step 4 reaches its second page boundary',
);
assert.equal(
  resolveSongCanvasText(synchronizedCue, 'Prompter', 'current', {
    visualStep: 3,
  }),
  'Line 4',
  'Prompter and Main must share the same global Step 4 boundary',
);
const bible = {
  verses: [
    { verse: 16, text: 'Perché Dio ha tanto amato il mondo' },
    { verse: 17, text: 'Dio infatti non ha mandato suo Figlio' },
  ],
};
assert.equal(liveBibleVerseAtStep(bible, 0)?.verse, 16);
assert.equal(liveBibleVerseAtStep(bible, 1)?.verse, 17);
assert.equal(liveBibleVerseAtStep(bible, 2), null);
const generated = generateSongSectionSteps(
  'This phrase fits well tiny\nAnother line',
  {
    maxLinesPerStep: 2,
    maxCharsPerLine: 21,
    minCharsPerStep: 12,
    mergeShortLines: false,
  },
);
assert.deepEqual(generated[0].lines, ['This phrase', 'fits well tiny']);
assert.equal(generated[1].content, 'Another line');
const merged = generateSongSectionSteps('Holy\nForever', {
  maxLinesPerStep: 2,
  maxCharsPerLine: 20,
  minCharsPerStep: 6,
  mergeShortLines: true,
});
assert.equal(merged[0].content, 'Holy Forever');
console.log(JSON.stringify({ ok: true, checks: 18 }));
