import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { songSectionShortcut } from '../apps/web/src/app/pages/live-control/live-control-shortcuts.ts';

const template = readFileSync(
  new URL(
    '../apps/web/src/app/pages/live-control/live-control.html',
    import.meta.url,
  ),
  'utf8',
);
const controller = readFileSync(
  new URL(
    '../apps/web/src/app/pages/live-control/live-control.ts',
    import.meta.url,
  ),
  'utf8',
);
const outputTemplate = readFileSync(
  new URL('../apps/web/src/app/pages/live-output/live-output.html', import.meta.url),
  'utf8',
);
const canvasTemplate = readFileSync(
  new URL('../apps/web/src/app/shared/live-canvas/live-canvas.html', import.meta.url),
  'utf8',
);
const countdownContract = readFileSync(
  new URL('../packages/shared/dto/src/lib/countdown.dto.ts', import.meta.url),
  'utf8',
);

assert.match(
  template,
  /class="step-card blank-card"[\s\S]*?\[class\.selected\]="!state\.program"/,
  'Blank must be selected when Program is clear',
);
assert.match(
  template,
  /\[class\.selected\]="isStepOnProgram\(state, card\)"/,
  'The selected step must follow Program, not Preview',
);
assert.match(
  template,
  /\(click\)="moveVisualStep\(state, -1\)"/,
  'The Previous button must navigate the visual-step timeline',
);
assert.match(
  template,
  /\(click\)="moveVisualStep\(state, 1\)"/,
  'The Next button must navigate the visual-step timeline',
);
assert.match(
  controller,
  /key === 'arrowleft' \|\| key === 'arrowright'/,
  'Left and Right arrows must be registered as step shortcuts',
);
assert.match(
  controller,
  /state\.preview\?\.lineupItemId !== state\.program\.lineupItemId[\s\S]*?this\.act\('Take'\)/,
  'A second Right arrow must take a prepared next cue to Program',
);
assert.match(
  controller,
  /direction === 1[\s\S]*?this\.act\('Next'\)/,
  'Right arrow at the final step must prepare the next lineup cue',
);
assert.match(
  template,
  /countdownPreview\(state\)/,
  'A countdown cue card must render its live remaining time',
);
assert.match(
  countdownContract,
  /name: z\.string\(\)\.trim\(\)\.min\(1\)\.default\('Timer'\)/,
  'Live countdown state must carry the canonical name and tolerate legacy persisted timers',
);
assert.match(
  outputTemplate,
  /COUNTDOWN \{\{ countdown\.name \}\}/,
  'The fallback live timer must be prefixed by COUNTDOWN and its name',
);
assert.match(
  canvasTemplate,
  /countdownLabel\(\)/,
  'A Timer element in a saved View must render the countdown label',
);
assert.match(
  controller,
  /key === 'arrowup' \|\| key === 'arrowdown'/,
  'Up and Down arrows must be registered as cue shortcuts',
);
assert.match(
  controller,
  /key === 'arrowup' \? 'Previous' : 'Next'/,
  'Up and Down arrows must prepare the previous or next cue',
);
assert.doesNotMatch(
  controller,
  /shortcut: displayIndex <= 9 \? String\(displayIndex\) : ''/,
  'Numeric shortcuts must not be assigned from the global step index',
);
assert.match(
  controller,
  /step === 0[\s\S]*?\? songSectionShortcut\(/,
  'A section shortcut must appear only on its first visual step',
);
assert.equal(songSectionShortcut('Verse', 1), '1');
assert.equal(songSectionShortcut('Verse', 2), '2');
assert.equal(songSectionShortcut('Verse', 10), '');
assert.equal(songSectionShortcut('Intro', 0), 'I');
assert.equal(songSectionShortcut('Pre-Chorus', 0), 'P');
assert.equal(songSectionShortcut('Chorus', 0), 'C');
assert.equal(songSectionShortcut('Bridge', 0), 'B');
assert.equal(songSectionShortcut('Tag', 0), 'T');
assert.equal(songSectionShortcut('Ending', 0), 'E');

console.log(JSON.stringify({ ok: true, checks: 24 }));
