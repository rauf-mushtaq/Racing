// The moves cut from the CMU motion capture for the game's people (tools/mocap/build.mjs turns them into assets/people/moves.json).
// Each: file (CMU take), from / to (seconds in it), face (how the move is turned: 'start' / 'end' (the way the hips face then), or { hand | foot, at }: the
// way that fist or foot points at that moment, so the blow goes straight ahead), mirror (left and right swapped), hit (seconds into the move at which a blow
// lands: the game hits then), loop, and what the move is for.
// calib: a take of the same person standing about, for the takes that hardly stand (the neck and head are set from standing frames: see page.js).
export const CALIB = { '140_01': '140_06', '140_03': '140_06', '140_08': '140_06' };
export const MOVES = {
  // ---- fists (14: a boxer; 13: another)
  jab:       { file: '14_01', from: 24.06, to: 24.66, face: { hand: 'L', at: 24.32 }, hit: [0.26], use: 'a quick left jab' },
  cross:     { file: '14_01', from: 23.55, to: 24.22, face: { hand: 'R', at: 23.87 }, hit: [0.32], use: 'a straight right' },
  hook:      { file: '13_17', from: 8.72, to: 9.45, face: { hand: 'R', at: 9.07 }, hit: [0.35], use: 'a right hook, swung round from the side' },
  body:      { file: '13_17', from: 29.38, to: 30.05, face: { hand: 'R', at: 29.69 }, hit: [0.31], use: 'a right to the body' },
  haymaker:  { file: '14_01', from: 37.05, to: 37.9, face: { hand: 'R', at: 37.43 }, hit: [0.38], use: 'a big, slow right that knocks people down' },
  combo:     { file: '14_01', from: 25.1, to: 26.1, face: { hand: 'R', at: 25.36 }, hit: [0.26, 0.44, 0.66], use: 'right, left, right, quickly' },
  guard:     { file: '14_01', from: 19.0, to: 20.6, face: 'start', loop: true, use: 'squared up, fists raised, bouncing on the feet' },
  // ---- feet
  kick:      { file: '143_24', from: 2.0, to: 3.05, face: { foot: 'R', at: 2.45 }, mirror: true, hit: [0.45], use: 'a street kick with the right foot' },
  kick_l:    { file: '143_24', from: 2.0, to: 3.05, face: { foot: 'L', at: 2.45 }, hit: [0.45], use: 'the same with the left' },
  roundhouse:{ file: '135_07', from: 0.5, to: 1.7, face: { foot: 'R', at: 1.0 }, hit: [0.5], use: 'a high roundhouse kick' },
  sidekick:  { file: '135_11', from: 2.35, to: 3.5, face: { foot: 'R', at: 2.88 }, hit: [0.53], use: 'a side kick' },
  frontkick: { file: '135_04', from: 2.65, to: 3.75, face: { foot: 'R', at: 3.13 }, hit: [0.48], use: 'a karate front kick' },
  // ---- being hit, going down, getting up
  stumble:   { file: '22_12', from: 0.05, to: 1.7, face: 'end', use: 'shoved: stumbling forward and catching the balance' },
  duck:      { file: '77_09', from: 1.75, to: 4.6, face: 'start', use: 'ducking with the arms over the head, then standing' },
  fall_back: { file: '90_18', from: 0.75, to: 2.4, face: 'start', use: 'falling flat on the back' },
  getup_back:{ file: '140_08', from: 1.7, to: 5.9, face: 'end', use: 'lying on the back: sitting up and standing' },
  getup_front:{ file: '140_01', from: 1.3, to: 5.0, face: 'end', use: 'lying face down: pushing up and standing' },
  getup_side:{ file: '140_03', from: 2.3, to: 6.6, face: 'end', use: 'lying on the side: rolling over and standing' },
  getup_hurt:{ file: '139_18', from: 0.05, to: 5.3, face: 'end', use: 'lying hurt: rolling, crawling and standing, slowly' },
};
