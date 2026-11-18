const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function timer() {
  const elements = new Map();
  const blobs = new Map();
  const storage = new Map();
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
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    window: { addEventListener() {} },
    // Rendering audio must not depend on ANY JavaScript timer.
    setTimeout() { throw new Error('Audio cue depends on a JavaScript timer'); },
    setInterval() { throw new Error('Audio cue depends on a JavaScript timer'); }
  });
  const html = readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^    initRehab\(\);$/m, '')
    .replace(/^    if \(!loadDefaultWorkout\(\)\)[\s\S]*$/m, '');
  vm.runInContext(script, context);
  const run = source => vm.runInContext(source, context);
  run(`exercises = [
    { id: 1, name: 'First', work: 5, rest: 3, sets: 2 },
    { id: 2, name: 'Second', work: 6, rest: 4, sets: 1 }
  ]; nextExerciseId = 3;`);
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

test('next exercise skips rests, follows the media position, and preserves pause', () => {
  const { run, audio, element } = timer();
  run("restMode = 'exercise'; buildQueue(); prepareWorkoutAudio(); workoutActive = true;");
  audio.currentTime = 7;
  audio.paused = false;
  run('skipToNextExercise()');
  assert.equal(audio.currentTime, 13);
  assert.equal(element('current-name').textContent, 'Second');
  assert.equal(element('countdown').textContent, 6);
  assert.equal(audio.paused, false);
  // A backgrounded display may still have a stale queueIndex. Use media time.
  audio.currentTime = 11;
  audio.paused = true;
  run('queueIndex = 4; skipToNextExercise()');
  assert.equal(audio.currentTime, 13);
  assert.equal(audio.paused, true);
  run('skipToNextExercise()');
  assert.equal(audio.currentTime, 23);
  assert.equal(element('set-info').textContent, 'Round 2 of 2');
  assert.equal(element('next-exercise-btn').disabled, true);
  run('skipToNextExercise()');
  assert.equal(audio.currentTime, 23);
  audio.currentTime = 28;
  run('syncAudioDisplay()');
  assert.equal(element('exercise-nav').style.display, 'none');
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

test('full-body workout is available alongside saved workouts with three timed rounds', () => {
  const { run, element } = timer();
  run(`localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify([
    { name: 'My saved workout', exercises: [{ name: 'Custom', work: 30, rest: 10, sets: 2 }] }
  ])); renderSavedWorkoutList();`);
  assert.match(element('saved-workout-list').innerHTML, /Full-body kettlebell circuit/);
  assert.match(element('saved-workout-list').innerHTML, /My saved workout/);
  run('loadWorkout(BUILT_IN_WORKOUTS[0], false); buildQueue();');
  const phases = JSON.parse(run('JSON.stringify(queue)'));
  const names = ['Rows', 'Cleans', 'Swings', 'Goblet squats', 'Bicep curls',
    'Tricep extensions', 'Pullovers', 'Alternating halos', 'Pushups'];
  assert.equal(run('restMode'), 'round');
  assert.equal(phases.filter(p => p.type === 'work').length, 27);
  assert.equal(phases.reduce((total, p) => total + p.duration, 0), 660);
  for (let round = 1; round <= 3; round++) {
    const roundPhases = phases.filter(p => p.set === round);
    assert.deepEqual(roundPhases.slice(0, 9).map(p => p.name), names);
    assert.ok(roundPhases.slice(0, 9).every(p => p.type === 'work' && p.duration === 20));
    assert.equal(roundPhases.length, round === 3 ? 9 : 10);
    if (round < 3) assert.equal(roundPhases[9].duration, 60);
  }
  assert.equal(run('getSavedWorkouts().length'), 1);
  assert.equal(run('getDefaultWorkoutName()'), '');
});

test('saved workout rest settings restore while older workouts retain current settings', () => {
  const { run, element } = timer();
  run(`loadWorkout({ name: 'Saved circuit', restMode: 'round', roundRest: 45,
    exercises: [{ name: 'Squats', work: 20, rest: 0, sets: 3 }] }, false);`);
  assert.equal(run('restMode'), 'round');
  assert.equal(Number(element('round-rest').value), 45);
  run(`loadWorkout({ name: 'Older workout',
    exercises: [{ name: 'Press', work: 30, rest: 15, sets: 4 }] }, false);`);
  assert.equal(run('restMode'), 'round');
  assert.equal(Number(element('round-rest').value), 45);
});

test('quick insertion places exercises and timed rests at the requested position', () => {
  const { run } = timer();
  run(`insertEntry(0, 'above'); insertEntry(2, 'below', 'rest');`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(exercises.map(e => e.name))')),
    ['', 'First', 'Second', 'Rest']);
  assert.equal(run('new Set(exercises.map(e => e.id)).size'), 4);
  assert.equal(run('exercises[0].work'), 5);
  assert.equal(run('exercises[0].sets'), 2);
  assert.equal(run('exercises[3].sets'), 1);
  run(`insertEntry(1, 'below', 'rest'); restMode = 'none'; buildQueue();`);
  const phases = JSON.parse(run('JSON.stringify(queue)'));
  assert.equal(phases[2].type, 'rest');
  assert.equal(phases[2].duration, 30);
  assert.equal(phases.filter(p => p.type === 'rest').length, 3);
  run(`const snapshot = getCurrentWorkoutSnapshot();
    loadWorkout({name: 'Rest circuit', exercises: snapshot}, false); buildQueue();`);
  assert.equal(run('queue.filter(p => p.type === "rest").length'), 3);
});

test('recent pills show completed unique routines newest first and keep rest settings', () => {
  const { run, element } = timer();
  run(`const entry = (date, name, completed = true) => ({ date, name, completed,
    exercises: [{name, work: 20, rest: 0, sets: 3}], restMode: 'round', roundRest: 60 });
    localStorage.setItem(DB_KEY, JSON.stringify([
      entry('2026-11-10', 'Rows'), entry('2026-11-12', 'Cleans'),
      entry('2026-11-15', 'Rows'), entry('2026-11-16', 'Stopped', false)
    ])); renderRecentWorkouts();`);
  assert.equal(element('recent-workouts').hidden, false);
  assert.deepEqual(JSON.parse(run('JSON.stringify(getRecentWorkouts().map(e => e.name))')), ['Rows', 'Cleans']);
  assert.match(element('recent-pills').innerHTML, /Load recent workout: Rows/);
  run('loadWorkout(getRecentWorkouts()[0], false); buildQueue();');
  assert.equal(run('exercises[0].name'), 'Rows');
  assert.equal(run('restMode'), 'round');
  assert.equal(run('getRoundRest()'), 60);
  run('localStorage.setItem(DB_KEY, "[]"); renderRecentWorkouts();');
  assert.equal(element('recent-workouts').hidden, true);
});

test('update appears after editing and replaces the loaded saved workout in place', () => {
  const { run, element } = timer();
  run(`showToast = () => {};
    loadWorkout(BUILT_IN_WORKOUTS[0], false);
    localStorage.setItem(SAVED_WORKOUTS_KEY, JSON.stringify([
      {name: 'Other routine', exercises: [{name: 'Press', work: 30, rest: 10, sets: 2}]}
    ]));`);
  assert.equal(element('workout-update').hidden, true);
  run('exercises[0].work = 40; updateTotalTime();');
  assert.equal(element('workout-update').hidden, false);
  run('updateLoadedWorkout()');
  assert.equal(element('workout-update').hidden, true);
  assert.equal(run('getSavedWorkouts().length'), 2);
  run('exercises[0].work = 50; updateTotalTime(); updateLoadedWorkout(); loadWorkoutOption(0);');
  assert.equal(run('getSavedWorkouts().length'), 2);
  assert.equal(run('exercises[0].work'), 50);
  assert.equal(run('getSavedWorkouts()[0].name'), 'Other routine');
  assert.equal(run('restMode'), 'round');
});

test('editing Pushups rest replaces the old 60s round setting in the timer and audio', () => {
  const { run, element } = timer();
  run(`loadWorkout({ name: 'Full-body kettlebell circuit', restMode: 'round', roundRest: 60,
    exercises: [
      {name:'Rows',work:25,rest:0,sets:4}, {name:'Cleans',work:20,rest:0,sets:4},
      {name:'Swings',work:25,rest:0,sets:4}, {name:'Goblet squats',work:20,rest:30,sets:4},
      {name:'Rest',kind:'rest',work:30,rest:0,sets:4}, {name:'Bicep curls',work:20,rest:0,sets:4},
      {name:'Tricep extensions',work:20,rest:0,sets:4}, {name:'Pullovers',work:20,rest:0,sets:4},
      {name:'Alternating halos',work:20,rest:0,sets:4}, {name:'Pushups',work:20,rest:30,sets:4}
    ]}, false); editExerciseRest(9, 30); buildQueue(); prepareWorkoutAudio();`);
  const phases = JSON.parse(run('JSON.stringify(queue)'));
  const boundaries = phases.map((phase,i) => phase.name === 'Pushups' ? phases[i+1] : null).filter(Boolean);
  assert.equal(boundaries.length, 3);
  assert.ok(boundaries.every(p => p.type === 'rest' && p.duration === 30));
  assert.equal(phases.at(-1).name, 'Pushups');
  assert.equal(phases.reduce((sum,p) => sum + p.duration,0), 970);
  assert.match(element('total-time').innerHTML, /16:10/);
  assert.equal(run('timeline.at(-1).end'), 975); // Includes the 5-second lead-in.
  assert.equal(run('getRoundRest()'), 30);
});

test('final-row and round-rest edits stay linked, including zero, and save consistently', () => {
  const { run, element } = timer();
  run(`loadWorkout(BUILT_IN_WORKOUTS[0], false);
    const restTestRows = exercises.map(ex => {
      const fields = [ex.name,ex.work,ex.rest,ex.sets].map(value => ({value, classList:{toggle(){}}}));
      return {querySelectorAll:()=>fields};
    });
    document.querySelectorAll = selector => selector === '.exercise-row' ? restTestRows : [];
    refreshRestInputs();`);
  assert.equal(run('restTestRows[0].querySelectorAll()[2].readOnly'), true);
  assert.equal(run('restTestRows[8].querySelectorAll()[2].readOnly'), false);
  run(`restTestRows[8].querySelectorAll()[2].value = 30; editExerciseRest(8,30); buildQueue();`);
  assert.equal(Number(element('round-rest').value), 30);
  assert.equal(run('exercises[8].rest'), 30);
  assert.equal(run('queue.filter(p=>p.type === "rest").every(p=>p.duration===30)'), true);
  element('round-rest').value = 45;
  run('saveRoundRest();');
  assert.equal(run('restTestRows[8].querySelectorAll()[2].value'),45);
  run(`restTestRows[8].querySelectorAll()[2].value = 0; editExerciseRest(8,0); buildQueue();`);
  assert.equal(run('queue.filter(p=>p.type === "rest").length'),0);
  run(`showToast = () => {}; updateLoadedWorkout(); document.querySelectorAll = () => [];
    loadWorkout(getSavedWorkouts()[0], false); buildQueue();`);
  assert.equal(run('getRoundRest()'),0);
  assert.equal(run('queue.filter(p=>p.type === "rest").length'),0);
});
