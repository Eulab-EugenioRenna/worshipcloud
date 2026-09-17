import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = process.env.API_URL ?? 'http://localhost:8080/api/v1';
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://worship:worship_local@localhost:5432/worship';
const email = `e2e-${randomUUID()}@example.test`;
let organizationId;
let userId;

async function request(path, options = {}, token) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body;
}

let checks = 0;

function assert(value, message) {
  if (!value) throw new Error(message);
  checks += 1;
}

try {
  const registered = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E User',
      email,
      password: 'correct-horse-battery-staple',
      organizationName: 'E2E Church',
      locationName: 'Main Hall',
    }),
  });
  userId = registered.user.id;
  organizationId = registered.memberships[0].organizationId;
  let token = registered.tokens.accessToken;
  assert(
    token && registered.tokens.refreshToken,
    'registration did not return both tokens',
  );

  const current = await request('/auth/me', {}, token);
  assert(current.user.email === email, 'auth/me returned a different user');

  const overview = await request(`/organizations/${organizationId}`, {}, token);
  assert(
    overview.locations.length === 1 && overview.members.length === 1,
    'organization bootstrap is incomplete',
  );

  const songImportSources = await request(
    `/organizations/${organizationId}/songs/import/sources`,
    {},
    token,
  );
  assert(
    Array.isArray(songImportSources),
    'song import sources were not listed',
  );
  const importedSong = await request(
    `/organizations/${organizationId}/songs/import`,
    {
      method: 'POST',
      body: JSON.stringify({
        songs: [
          {
            locale: 'it',
            title: 'Canto importato',
            sections: [
              {
                type: 'Chorus',
                label: 'Ritornello',
                content: 'Testo importato',
              },
            ],
          },
        ],
      }),
    },
    token,
  );
  assert(
    importedSong.imported === 1 && importedSong.songs[0].sections.length === 1,
    'JSON song import did not persist the complete song',
  );

  const bibleImportSources = await request(
    `/organizations/${organizationId}/bible/import/sources`,
    {},
    token,
  );
  assert(
    bibleImportSources.some((source) => source.id === 'getbible-v2'),
    'GetBible import source was not listed',
  );
  const importedTranslation = await request(
    `/organizations/${organizationId}/bible/import`,
    {
      method: 'POST',
      body: JSON.stringify({
        translation: {
          locale: 'it',
          name: 'Test Bible',
          abbreviation: 'TST',
        },
        verses: [
          {
            book: 'Giovanni',
            bookOrder: 43,
            chapter: 3,
            verse: 1,
            text: 'Verso uno',
          },
          {
            book: 'Giovanni',
            bookOrder: 43,
            chapter: 3,
            verse: 2,
            text: 'Verso due',
          },
        ],
      }),
    },
    token,
  );
  assert(
    importedTranslation.importedVerses === 2,
    'JSON Bible import did not persist every verse',
  );
  const importedChapters = await request(
    `/organizations/${organizationId}/bible/chapters?translationId=${importedTranslation.translation.id}&book=Giovanni`,
    {},
    token,
  );
  assert(
    importedChapters.length === 1 && importedChapters[0] === 3,
    'imported Bible chapter is unavailable to the chapter picker',
  );
  await request(
    `/organizations/${organizationId}/bible/translations/${importedTranslation.translation.id}/verses/import`,
    {
      method: 'POST',
      body: JSON.stringify({
        verses: [
          {
            book: 'Giovanni',
            bookOrder: 43,
            chapter: 3,
            verse: 1,
            text: 'Verso uno aggiornato',
          },
        ],
      }),
    },
    token,
  );
  const mergedChapter = await request(
    `/organizations/${organizationId}/bible/search?translationId=${importedTranslation.translation.id}&query=Giovanni%203`,
    {},
    token,
  );
  assert(
    mergedChapter.verses.length === 2 &&
      mergedChapter.verses[0].text === 'Verso uno aggiornato',
    'partial Bible re-import must update supplied verses without deleting the rest of the chapter',
  );
  const compactVerseReference = await request(
    `/organizations/${organizationId}/bible/search?translationId=${importedTranslation.translation.id}&query=Gv3%3A1`,
    {},
    token,
  );
  assert(
    compactVerseReference.reference === 'Giovanni 3:1' &&
      compactVerseReference.verses.length === 1,
    'compact Bible references must resolve a single verse',
  );
  const compactChapterReference = await request(
    `/organizations/${organizationId}/bible/search?translationId=${importedTranslation.translation.id}&query=Gv3`,
    {},
    token,
  );
  assert(
    compactChapterReference.reference === 'Giovanni 3:1-2' &&
      compactChapterReference.verses.length === 2,
    'compact Bible chapter references must resolve the whole chapter',
  );
  const singleVersePassage = await request(
    `/organizations/${organizationId}/bible/passages`,
    {
      method: 'POST',
      body: JSON.stringify({
        translationId: compactVerseReference.translationId,
        book: compactVerseReference.book,
        chapter: compactVerseReference.chapter,
        verseStart: compactVerseReference.verseStart,
        verseEnd: compactVerseReference.verseEnd,
      }),
    },
    token,
  );
  assert(
    singleVersePassage.verses.length === 1,
    'a single-verse cue source must persist only that verse',
  );
  const fullChapterPassage = await request(
    `/organizations/${organizationId}/bible/passages`,
    {
      method: 'POST',
      body: JSON.stringify({
        translationId: compactChapterReference.translationId,
        book: compactChapterReference.book,
        chapter: compactChapterReference.chapter,
      }),
    },
    token,
  );
  assert(
    fullChapterPassage.verses.length === 2,
    'a chapter cue source must persist the whole chapter',
  );

  const streamController = new AbortController();
  const stream = await fetch(
    `${base}/events/stream?organizationId=${organizationId}`,
    {
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${token}`,
      },
      signal: streamController.signal,
    },
  );
  assert(stream.ok && stream.body, 'event stream did not connect');
  const eventReader = stream.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

  const created = await request(
    `/organizations/${organizationId}/services`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Sunday Service',
        date: '2026-09-20',
        time: '10:30',
        locationId: overview.locations[0].id,
        responsibleUserId: userId,
      }),
    },
    token,
  );
  assert(
    created.status === 'Draft' && created.lineup.length === 0,
    'service defaults are incorrect',
  );

  const eventDeadline = Date.now() + 5000;
  let eventPayload = '';
  while (
    !eventPayload.includes('service.created') &&
    Date.now() < eventDeadline
  ) {
    const chunk = await Promise.race([
      eventReader.read(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('event stream timed out')), 5000),
      ),
    ]);
    if (chunk.done) break;
    eventPayload += chunk.value ?? '';
  }
  assert(
    eventPayload.includes('service.created'),
    'event stream did not deliver service.created',
  );
  streamController.abort();

  const songTemplate = await request(
    `/organizations/${organizationId}/slide-templates`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Song Main',
        kind: 'Song',
        target: 'Main',
        layout: {
          version: 1,
          size: { width: 1920, height: 1080, orientation: 'H' },
          background: { color: '#000000' },
          elements: [
            {
              id: 'lyrics',
              type: 'Lyrics',
              x: 10,
              y: 30,
              width: 80,
              height: 40,
              zIndex: 1,
              style: { color: '#ffffff', fontSize: 7 },
              data: { stepsPerSlide: 2 },
            },
          ],
        },
      }),
    },
    token,
  );
  await request(
    `/organizations/${organizationId}/slide-templates`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Song Prompter',
        kind: 'Song',
        target: 'Prompter',
        layout: {
          version: 1,
          size: { width: 1920, height: 1080, orientation: 'H' },
          background: { color: '#000000' },
          elements: [
            {
              id: 'lyrics',
              type: 'Lyrics',
              x: 5,
              y: 20,
              width: 60,
              height: 60,
              zIndex: 1,
              style: { color: '#ffffff', fontSize: 4 },
              data: { stepsPerSlide: 1 },
            },
          ],
        },
      }),
    },
    token,
  );
  const songAlphaTemplate = await request(
    `/organizations/${organizationId}/slide-templates`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Song Alpha',
        kind: 'Song',
        target: 'Alpha',
        layout: {
          version: 1,
          size: { width: 1920, height: 1080, orientation: 'H' },
          background: { color: '#000000' },
          elements: [
            {
              id: 'lyrics',
              type: 'Lyrics',
              x: 5,
              y: 20,
              width: 90,
              height: 60,
              zIndex: 1,
              style: { color: '#ffffff', fontSize: 5 },
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
      }),
    },
    token,
  );

  const song = await request(
    `/organizations/${organizationId}/songs`,
    {
      method: 'POST',
      body: JSON.stringify({
        locale: 'en',
        title: 'Amazing Grace',
        sections: [
          {
            type: 'Verse',
            label: 'Verse 1',
            content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
          },
        ],
      }),
    },
    token,
  );
  assert(
    JSON.stringify(song.sections[0].steps?.map((step) => step.content)) ===
      JSON.stringify(['Line 1\nLine 2', 'Line 3\nLine 4', 'Line 5\nLine 6']),
    `song creation must persist balanced canonical steps before view pagination; received ${JSON.stringify(song.sections[0].steps)}`,
  );
  const editedSong = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Amazing Grace (edited)',
        sections: song.sections.map((section) => ({
          id: section.id,
          type: section.type,
          label: section.label,
          content: `${section.content} (edited)`,
        })),
      }),
    },
    token,
  );
  assert(
    editedSong.sections[0].id === song.sections[0].id &&
      editedSong.sections[0].content.endsWith('(edited)'),
    'song editing must retain existing section identities',
  );
  assert(
    editedSong.visualSlides.length === 1 &&
      editedSong.visualSlides[0].sectionId === editedSong.sections[0].id &&
      editedSong.visualSlides[0].layouts.some(
        (layout) =>
          layout.target === 'Main' && layout.templateId === songTemplate.id,
      ),
    'saving a song must create a Step 1 visual slide from the configured Song view',
  );
  const mainTimeline = editedSong.visualSlides[0].layouts
    .find((layout) => layout.target === 'Main')
    ?.layout.elements.find((element) => element.type === 'Lyrics')
    ?.data.lyricPagination;
  const prompterTimeline = editedSong.visualSlides[0].layouts
    .find((layout) => layout.target === 'Prompter')
    ?.layout.elements.find((element) => element.type === 'Lyrics')
    ?.data.lyricPagination;
  assert(
    JSON.stringify(mainTimeline?.stepMap) === JSON.stringify([1, 3]) &&
      JSON.stringify(prompterTimeline?.stepMap) === JSON.stringify([1, 2, 3]),
    'every view must map its pages onto the canonical SongStep timeline',
  );
  const manuallySteppedSong = await request(
    `/organizations/${organizationId}/songs/${song.id}/sections/${song.sections[0].id}/steps`,
    {
      method: 'PUT',
      body: JSON.stringify({
        steps: ['Manual first step', 'Manual second step'],
      }),
    },
    token,
  );
  assert(
    JSON.stringify(
      manuallySteppedSong.sections[0].steps.map((step) => step.content),
    ) === JSON.stringify(['Manual first step', 'Manual second step']),
    'manual canonical steps must be persisted',
  );
  let regeneratedSong = await request(
    `/organizations/${organizationId}/songs/${song.id}/steps/regenerate`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );
  assert(
    regeneratedSong.sections[0].steps.length === 3 &&
      regeneratedSong.sections[0].steps[0].content === 'Line 1\nLine 2',
    'recreate steps must replace manual edits using the current Alpha rules',
  );
  await request(
    `/organizations/${organizationId}/slide-templates/${songAlphaTemplate.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        layout: {
          ...songAlphaTemplate.layout,
          elements: songAlphaTemplate.layout.elements.map((element) =>
            element.type === 'Lyrics'
              ? {
                  ...element,
                  data: {
                    ...element.data,
                    stepGenerator: {
                      ...element.data.stepGenerator,
                      maxLinesPerStep: 1,
                    },
                  },
                }
              : element,
          ),
        },
      }),
    },
    token,
  );
  const songAfterSameTextEdit = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sections: regeneratedSong.sections.map((section) => ({
          id: section.id,
          type: section.type,
          label: section.label,
          content: section.content,
        })),
      }),
    },
    token,
  );
  assert(
    songAfterSameTextEdit.sections[0].steps.length === 6,
    'editing a Song with unchanged text must recreate steps from the current Alpha rule',
  );
  await request(
    `/organizations/${organizationId}/slide-templates/${songAlphaTemplate.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ layout: songAlphaTemplate.layout }),
    },
    token,
  );
  regeneratedSong = await request(
    `/organizations/${organizationId}/songs/${song.id}/steps/regenerate`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );
  const globalViews = await request(
    `/organizations/${organizationId}/slide-templates`,
    {},
    token,
  );
  assert(
    ['Main', 'Stage', 'Prompter', 'Alpha'].every((target) =>
      globalViews.some(
        (view) =>
          view.kind === 'Default' &&
          view.target === target &&
          ['Default', `Default · ${target}`].includes(view.name),
      ),
    ),
    'Settings must expose one canonical Default layout for every output view',
  );
  const defaultMain = globalViews.find((view) => view.name === 'Default');
  assert(defaultMain, 'Settings must expose the canonical Main Default');
  const customizedDefault = await request(
    `/organizations/${organizationId}/slide-templates/${defaultMain.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        layout: {
          ...defaultMain.layout,
          background: { kind: 'color', color: '#123456' },
        },
      }),
    },
    token,
  );
  assert(
    customizedDefault.layout.background.color === '#123456',
    'the canonical Default canvas must be editable',
  );
  const persistedDefaults = await request(
    `/organizations/${organizationId}/slide-templates`,
    {},
    token,
  );
  assert(
    persistedDefaults.find((view) => view.id === defaultMain.id)?.layout
      .background.color === '#123456',
    'listing layouts must preserve an edited Default canvas',
  );
  const restoredDefault = await request(
    `/organizations/${organizationId}/slide-templates/${defaultMain.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ layout: defaultMain.layout }),
    },
    token,
  );
  assert(
    restoredDefault.layout.background.color ===
      defaultMain.layout.background.color,
    'Restore default must be able to write the canonical canvas back',
  );
  const prompterDefaultForRestore = globalViews.find(
    (view) => view.name === 'Default · Prompter',
  );
  assert(
    prompterDefaultForRestore,
    'Settings must expose the Prompter Default layout',
  );
  const restoredPrompter = await request(
    `/organizations/${organizationId}/slide-templates/${prompterDefaultForRestore.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        layout: prompterDefaultForRestore.layout,
      }),
    },
    token,
  );
  assert(
    restoredPrompter.target === 'Prompter',
    'restoring a Prompter Default canvas must not inject the Main target',
  );
  const songAfterPrompterRestore = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {},
    token,
  );
  const restoredPrompterPagination =
    songAfterPrompterRestore.visualSlides[0].layouts
      .find((layout) => layout.target === 'Prompter')
      ?.layout.elements.find((element) => element.type === 'Lyrics')
      ?.data.lyricPagination;
  const restoredPrompterLines = restoredPrompterPagination?.pages
    .flat(2)
    .filter((line, index, values) => values.indexOf(line) === index);
  assert(
    restoredPrompterLines?.length ===
      songAfterPrompterRestore.sections[0].steps.flatMap((step) => step.lines)
        .length,
    'restoring a global View must regenerate all derived Song lines without truncation',
  );
  const duplicatedDefault = await request(
    `/organizations/${organizationId}/slide-templates`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Default copy',
        kind: 'Default',
        target: 'Main',
        layout: defaultMain.layout,
      }),
    },
    token,
  );
  assert(
    duplicatedDefault.name === 'Default copy' &&
      duplicatedDefault.kind === 'Default' &&
      duplicatedDefault.target === 'Main',
    'duplicating Default must preserve its type, output, and canvas choice',
  );
  const defaultPrompter = globalViews.find(
    (view) => view.name === 'Default · Prompter',
  );
  assert(
    defaultPrompter?.layout.elements.some(
      (element) => element.type === 'NextStep',
    ) &&
      !defaultPrompter.layout.elements.some(
        (element) => element.type === 'Shape',
      ) &&
      defaultPrompter.layout.background.kind === 'gradient',
    'the Default Prompter must own one functional NextStep element and its gradient background',
  );
  const defaultUpdate = await fetch(
    `${base}/organizations/${organizationId}/slide-templates/${defaultMain.id}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'Changed default' }),
    },
  );
  const defaultDelete = await fetch(
    `${base}/organizations/${organizationId}/slide-templates/${defaultMain.id}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    },
  );
  assert(
    defaultUpdate.status === 400 && defaultDelete.status === 400,
    'Default layouts must be duplicated instead of edited or removed',
  );
  const songWithViews = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {},
    token,
  );
  assert(
    ['Main', 'Stage', 'Prompter', 'Alpha'].every((target) =>
      songWithViews.visualSlides[0].layouts.some(
        (layout) => layout.target === target,
      ),
    ),
    'each Song view must reach every saved section before output URLs render it',
  );
  const staleVisualSlide = songWithViews.visualSlides[0];
  const normalizedDefault = await request(
    `/organizations/${organizationId}/songs/${song.id}/visual-slides/${staleVisualSlide.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        layouts: [
          ...staleVisualSlide.layouts
            .filter((layout) => layout.target !== 'Main')
            .map((layout) => ({
              target: layout.target,
              templateId: layout.templateId,
              layout: layout.layout,
            })),
          {
            target: 'Main',
            templateId: defaultMain.id,
            layout: {
              ...defaultMain.layout,
              background: { kind: 'color', color: '#ff00ff' },
              elements: defaultMain.layout.elements.map((element) =>
                element.type === 'Lyrics'
                  ? {
                      ...element,
                      x: 42,
                      data: {
                        ...element.data,
                        lyricPagination: {
                          pages: [
                            [[1], [2], [3]],
                            [[4], [5], [6]],
                          ],
                        },
                      },
                    }
                  : element,
              ),
            },
          },
        ],
      }),
    },
    token,
  );
  const normalizedMain = normalizedDefault.layouts.find(
    (layout) => layout.target === 'Main',
  )?.layout;
  assert(
    JSON.stringify(normalizedMain?.background) ===
      JSON.stringify(defaultMain.layout.background) &&
      normalizedMain?.elements.find((element) => element.type === 'Lyrics')
        ?.x ===
        defaultMain.layout.elements.find((element) => element.type === 'Lyrics')
          ?.x,
    'saving a stale Default child must inherit the current global canvas instead of returning 400',
  );
  const alternateMain = await request(
    `/organizations/${organizationId}/slide-templates`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Alternate Main',
        kind: 'Song',
        target: 'Main',
        layout: {
          version: 1,
          size: { width: 1920, height: 1080, orientation: 'H' },
          background: {
            kind: 'gradient',
            color: '#050706',
            gradient: 'linear-gradient(135deg, #243316, #050706)',
          },
          elements: [
            {
              id: 'lyrics',
              type: 'Lyrics',
              x: 8,
              y: 25,
              width: 84,
              height: 50,
              zIndex: 1,
              style: { color: '#ffffff', fontSize: 6 },
              data: {},
            },
          ],
        },
      }),
    },
    token,
  );
  const visualSlide = songWithViews.visualSlides[0];
  const assignedView = await request(
    `/organizations/${organizationId}/songs/${song.id}/visual-slides/${visualSlide.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        layouts: [
          ...visualSlide.layouts
            .filter((layout) => layout.target !== 'Main')
            .map((layout) => ({
              target: layout.target,
              templateId: layout.templateId,
              layout: layout.layout,
            })),
          {
            target: 'Main',
            templateId: alternateMain.id,
            layout: {
              ...alternateMain.layout,
              elements: alternateMain.layout.elements.map((element) =>
                element.type === 'Lyrics'
                  ? {
                      ...element,
                      data: {
                        ...element.data,
                        lyricPagination: { pages: [[[1]]] },
                      },
                    }
                  : element,
              ),
            },
          },
        ],
      }),
    },
    token,
  );
  assert(
    assignedView.layouts.find((layout) => layout.target === 'Main')
      ?.templateId === alternateMain.id &&
      assignedView.layouts
        .find((layout) => layout.target === 'Main')
        ?.layout.elements.find((element) => element.type === 'Lyrics')
        ?.data.lyricPagination.pages.flat(2).length ===
        regeneratedSong.sections[0].steps.flatMap((step) => step.lines).length,
    'a Song may select another global layout, but local pagination must be ignored and every canonical line retained',
  );
  const assignedMainLayout = assignedView.layouts.find(
    (layout) => layout.target === 'Main',
  );
  const stalePaginationLayout = {
    ...assignedMainLayout.layout,
    elements: assignedMainLayout.layout.elements.map((element) =>
      element.type === 'Lyrics'
        ? {
            ...element,
            data: {
              ...element.data,
              lyricPagination: { pages: [[[1]]], stepMap: [1] },
            },
          }
        : element,
    ),
  };
  const stalePool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await stalePool.query(
      `UPDATE "SongVisualSlideLayout" SET layout = $2::jsonb WHERE id = $1`,
      [assignedMainLayout.id, JSON.stringify(stalePaginationLayout)],
    );
  } finally {
    await stalePool.end();
  }
  const item = await request(
    `/organizations/${organizationId}/services/${created.id}/lineup`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'Song',
        title: editedSong.title,
        sourceId: song.id,
      }),
    },
    token,
  );
  assert(item.position === 0, 'first lineup item has an incorrect position');
  const songAfterInsertion = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {},
    token,
  );
  assert(
    songAfterInsertion.visualSlides[0].layouts
      .find((layout) => layout.target === 'Main')
      ?.layout.elements.find((element) => element.type === 'Lyrics')
      ?.data.lyricPagination.pages.flat(2).length ===
      songAfterInsertion.sections[0].steps.flatMap((step) => step.lines).length,
    'inserting a Song cue must rebuild stale pages from the current global View',
  );

  const updated = await request(
    `/organizations/${organizationId}/services/${created.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'Planning',
        readiness: { team: true },
      }),
    },
    token,
  );
  assert(
    updated.status === 'Planning' && updated.readiness.team,
    'service update was not persisted',
  );

  const listed = await request(
    `/organizations/${organizationId}/services?status=Planning`,
    {},
    token,
  );
  assert(
    listed.length === 1 && listed[0].lineup.length === 1,
    'service listing did not return the complete service',
  );

  const textItem = await request(
    `/organizations/${organizationId}/services/${created.id}/lineup`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'Text',
        title: 'Welcome',
      }),
    },
    token,
  );

  const staleBeforeLivePool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await staleBeforeLivePool.query(
      `UPDATE "SongVisualSlideLayout" SET layout = $2::jsonb WHERE id = $1`,
      [assignedMainLayout.id, JSON.stringify(stalePaginationLayout)],
    );
  } finally {
    await staleBeforeLivePool.end();
  }

  const live = await request(
    `/organizations/${organizationId}/services/${created.id}/live/start`,
    { method: 'POST', body: '{}' },
    token,
  );
  const songAfterGoingLive = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {},
    token,
  );
  assert(
    songAfterGoingLive.visualSlides[0].layouts
      .find((layout) => layout.target === 'Main')
      ?.layout.elements.find((element) => element.type === 'Lyrics')
      ?.data.lyricPagination.pages.flat(2).length ===
      songAfterGoingLive.sections[0].steps.flatMap((step) => step.lines).length,
    'Go Live must rebuild stale pages from the current global View',
  );
  const countdown = await request(
    `/organizations/${organizationId}/countdowns`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Legacy countdown regression',
        mode: 'Duration',
        durationSeconds: 300,
        autoAdvance: false,
      }),
    },
    token,
  );
  await request(
    `/live-sessions/${live.id}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'StartCountdown',
        countdownId: countdown.id,
      }),
    },
    token,
  );
  const legacyPool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await legacyPool.query(
      `UPDATE "LiveSession"
       SET countdown = countdown - 'name'
       WHERE id = $1`,
      [live.id],
    );
  } finally {
    await legacyPool.end();
  }
  const legacyRestart = await request(
    `/organizations/${organizationId}/services/${created.id}/live/start`,
    { method: 'POST', body: '{}' },
    token,
  );
  assert(
    legacyRestart.state.countdown?.name === 'Timer',
    'Go live must tolerate persisted countdown state from before countdown names',
  );
  const restoredCountdown = await request(
    `/live-sessions/${live.id}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'StartCountdown',
        countdownId: countdown.id,
      }),
    },
    token,
  );
  assert(
    restoredCountdown.state.countdown?.name === countdown.name,
    'starting a countdown must restore its canonical definition name',
  );
  const defaultPreview = await request(
    `/live-sessions/${live.id}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'Preview',
        lineupItemId: textItem.id,
      }),
    },
    token,
  );
  assert(
    defaultPreview.state.preview?.content.activeVisualSlide?.layouts.length ===
      4,
    'every cue type must receive the four output Default layouts',
  );
  assert(
    defaultPreview.state.preview.content.activeVisualSlide.layouts
      .find((layout) => layout.target === 'Main')
      ?.layout.elements.some((element) => element.type === 'CueTitle'),
    'the Main Default layout must adapt its primary content to a Text cue',
  );
  const prepared = await request(
    `/live-sessions/${live.id}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: 'Preview',
        lineupItemId: item.id,
        visualSlideId: songWithViews.visualSlides[0].id,
        visualStep: 0,
      }),
    },
    token,
  );
  const onAir = await request(
    `/live-sessions/${prepared.id}/actions`,
    { method: 'POST', body: JSON.stringify({ action: 'Take' }) },
    token,
  );
  for (const target of ['main', 'stage', 'prompter', 'alpha']) {
    const key = new URL(onAir.outputUrls[target]).searchParams.get('key');
    const state = await request(`/live-sessions/${onAir.id}/state?key=${key}`);
    assert(
      state.program?.content.song?.activeVisualSlide?.layouts.some(
        (layout) => layout.target.toLowerCase() === target,
      ),
      `${target} output URL must receive its layout together with the current Song step`,
    );
  }

  const cleared = await request(
    `/live-sessions/${onAir.id}/actions`,
    { method: 'POST', body: JSON.stringify({ action: 'Clear' }) },
    token,
  );
  assert(cleared.state.program === null, 'Clear must remove the Program cue');
  assert(
    cleared.state.preview?.visualSlideId === songWithViews.visualSlides[0].id &&
      cleared.state.preview.visualStep === 0,
    'Clear must preserve Preview while the control UI moves selection to Blank',
  );

  const ended = await request(
    `/live-sessions/${cleared.id}/actions`,
    { method: 'POST', body: JSON.stringify({ action: 'End' }) },
    token,
  );
  const restarted = await request(
    `/organizations/${organizationId}/services/${created.id}/live/start`,
    { method: 'POST', body: '{}' },
    token,
  );
  assert(ended.status === 'Ended', 'End must close the current Live Session');
  assert(
    restarted.status === 'Live' && restarted.id !== ended.id,
    'Go live after End must create a new Live Session for the same service',
  );

  await request(
    `/organizations/${organizationId}/slide-templates/${alternateMain.id}`,
    { method: 'DELETE' },
    token,
  );
  const songAfterLayoutRemoval = await request(
    `/organizations/${organizationId}/songs/${song.id}`,
    {},
    token,
  );
  assert(
    songAfterLayoutRemoval.visualSlides.every(
      (visualSlide) =>
        visualSlide.layouts.find((layout) => layout.target === 'Main')
          ?.templateId === defaultMain.id,
    ),
    'removing a referenced custom layout must reconnect its views to the matching Default',
  );

  const notifications = await request(
    `/notifications?organizationId=${organizationId}&limit=25&unreadOnly=true`,
    {},
    token,
  );
  assert(
    notifications.items.length >= 3,
    'domain events did not create notifications',
  );
  await request(
    `/notifications/${notifications.items[0].id}/read`,
    { method: 'PATCH', body: '{}' },
    token,
  );

  const refreshed = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: registered.tokens.refreshToken,
    }),
  });
  token = refreshed.tokens.accessToken;
  assert(
    refreshed.tokens.refreshToken !== registered.tokens.refreshToken,
    'refresh token was not rotated',
  );

  await request(
    '/auth/logout',
    {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshed.tokens.refreshToken }),
    },
    token,
  );
  const rejected = await fetch(`${base}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert(rejected.status === 401, 'logout did not revoke the session');

  console.log(JSON.stringify({ ok: true, checks }));
} finally {
  if (organizationId || userId) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      if (organizationId) {
        await pool.query('DELETE FROM "Organization" WHERE id = $1', [
          organizationId,
        ]);
      }
      if (userId) {
        await pool.query('DELETE FROM "User" WHERE id = $1', [userId]);
      }
    } finally {
      await pool.end();
    }
  }
}
