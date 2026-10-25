const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function timer() {
  const elements = new Map();
  const blobs = new Map();
  const audio = {
    paused: true, currentTime: 0, ended: false,
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
    load() {}, removeAttribute() {}, addEventListener() {}
  };
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'round-rest' ? '7' : '', style: {}, textContent: '', innerHTML: '',
      classList: { add() {}, remove() {}, toggle() {} }
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    Blob, DataView, ArrayBuffer, Uint8Array, Map, Set, console,
    URL: {
      createObjectURL(blob) { const id = 'blob:' + blobs.size; blobs.set(id, blob); return id; },
      revokeObjectURL(id) { blobs.delete(id); }
    },
    document: {
      getElementById: id => id === 'workout-audio' ? audio : element(id),
      querySelectorAll: () => [], addEventListener() {}
    },
    navigator: { mediaSession: { setActionHandler() {} } },
    localStorage: { getItem: () => null },
    window: {},
    // Rendering audio must not depend on ANY JavaScript timer.
    setTimeout() { throw new Error('Audio cue depends on a JavaScript timer'); },
    setInterval() { throw new Error('Audio cue depends on a JavaScript timer'); }
  });
  const html = readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^    initRehab\(\);$/m, '')
    .replace(/    if \(!loadDefaultWorkout\(\)\)[\s\S]*$/, '');
  vm.runInContext(script, context);
  const run = source => vm.runInContext(source, context);
  run(`exercises = [
    { id: 1, name: 'First', work: 5, rest: 3, sets: 2 },
    { id: 2, name: 'Second', work: 6, rest: 4, sets: 1 }
  ];`);
  return { run, audio, blobs, element };
}

test('rest modes and unequal sets skip the final rest', () => {
  const { run } = timer();
  for (const [mode, expected] of [
    ['exercise', ['First:5', 'First:3', 'Second:6', 'Second:4', 'First:5']],
    ['round', ['First:5', 'Second:6', 'Rest:7', 'First:5']],
    ['none', ['First:5', 'Second:6', 'First:5']]
  ]) {
    run(`restMode = '${mode}'; buildQueue();`);
    assert.deepEqual(JSON.parse(run('JSON.stringify(queue.map(p => p.name + ":" + p.duration))')), expected);
  }
});

test('one WAV contains countdown, work, rest and completion sounds without JS callbacks', async () => {
  const { run, blobs } = timer();
  run(`restMode = 'exercise'; buildQueue(); prepareWorkoutAudio();`);
  assert.equal(blobs.size, 1);
  const data = Buffer.from(await [...blobs.values()][0].arrayBuffer());
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  assert.equal(data.readUInt32LE(24), 8000);
  assert.equal(data.readUInt16LE(22), 1);
  assert.equal(data.readUInt16LE(34), 16);
  assert.equal(data.readUInt32LE(40), data.length - 44);
  assert.equal(data.readUInt32LE(4), data.length - 8);
  assert.equal((data.length - 44) / 16000, 29.5); // 5 ready + 23 circuit + 1.5 melody.
  function energy(at, seconds = .1) {
    let total = 0;
    for (let i = Math.round(at * 8000); i < Math.round((at + seconds) * 8000); i++) {
      total += Math.abs(data.readInt16LE(44 + i * 2));
    }
    return total;
  }
  for (const at of [2, 3, 4, 5, 10, 13, 19, 23, 28]) {
    assert.ok(energy(at) > 100000, `Missing audible cue at ${at}s`);
  }
  assert.equal(energy(0), 0);
  assert.equal(energy(5.5), 0);
  assert.equal(energy(29.4), 0);
});

test('display catches up from media position across multiple background phases', () => {
  const { run, audio, element } = timer();
  run("restMode = 'exercise'; buildQueue(); prepareWorkoutAudio(); workoutActive = true;");
  audio.currentTime = 14.25;
  run('syncAudioDisplay()');
  assert.equal(element('phase').textContent, 'work');
  assert.equal(element('current-name').textContent, 'Second');
  assert.equal(element('countdown').textContent, 5);
  audio.currentTime = 20;
  run('syncAudioDisplay()');
  assert.equal(element('phase').textContent, 'rest');
  assert.equal(element('countdown').textContent, 3);
});

test('restart exercise from rest seeks to preceding work; stop releases its track', () => {
  const { run, audio, blobs } = timer();
  run("buildQueue(); prepareWorkoutAudio(); workoutActive = true; queueIndex = 1;");
  audio.currentTime = 11;
  run('restartExercise()');
  assert.equal(audio.currentTime, 5);
  assert.equal(audio.paused, false);
  run('releaseWorkoutAudio()');
  assert.equal(audio.paused, true);
  assert.equal(blobs.size, 0);
  assert.equal(run('timeline.length'), 0);
});

test('set adjustment clamps each exercise independently to at least one', () => {
  const { run } = timer();
  run('adjustAllSets(-1)');
  assert.equal(run('exercises[0].sets'), 1);
  assert.equal(run('exercises[1].sets'), 1);
  run('adjustAllSets(-1)');
  assert.equal(run('exercises[1].sets'), 1);
  assert.equal(run("boundedNumber('', 1, 99, 4)"), 4);
  assert.equal(run('boundedNumber(Infinity, 1, 99, 4)'), 4);
});
