/**
 * The `no-restricted-syntax` selectors that keep the wall clock and real
 * timer waits out of tests. eslint.config.ts applies them to test files, and
 * test/unit/scripts/test-wall-clock-guard.test.ts applies them to the test
 * directories that the lint config ignores.
 *
 * Known limit: a selector sees syntax, not values. A clock reached through a
 * function parameter, `Reflect.get`, a computed key that is not a string
 * literal, or `eval` is not caught. Review catches those.
 */

const WALL_CLOCK = 'Tests must not read the wall clock. Use a fixed value, an injected clock, or vi.useFakeTimers().';
const REAL_TIMER = 'Tests must not wait on real timers. Use vi.useFakeTimers(), an injected scheduler, or wait on a condition.';
const CLOCK_OBJECT = '/^(Date|performance)$/';
const TIMER = '/^set(Timeout|Interval)$/';

export const TEST_WALL_CLOCK_SELECTORS = Object.freeze([
  // Date.now, performance.now, Date['now'], globalThis.Date.now, x.performance.now
  { selector: `MemberExpression[object.name=${CLOCK_OBJECT}][property.name='now']`, message: WALL_CLOCK },
  { selector: `MemberExpression[object.name=${CLOCK_OBJECT}][property.value='now']`, message: WALL_CLOCK },
  { selector: `MemberExpression[object.property.name=${CLOCK_OBJECT}][property.name='now']`, message: WALL_CLOCK },
  // new Date(), new globalThis.Date(), Date(), globalThis.Date()
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: WALL_CLOCK },
  { selector: "NewExpression[callee.property.name='Date'][arguments.length=0]", message: WALL_CLOCK },
  { selector: "CallExpression[callee.name='Date']", message: WALL_CLOCK },
  { selector: "CallExpression[callee.property.name='Date']", message: WALL_CLOCK },
  // Aliases and destructuring: const D = Date; const { now } = performance;
  { selector: `VariableDeclarator[init.name=${CLOCK_OBJECT}]`, message: WALL_CLOCK },
  { selector: `VariableDeclarator[init.property.name=${CLOCK_OBJECT}]`, message: WALL_CLOCK },
  { selector: "ObjectPattern > Property[key.name='performance']", message: WALL_CLOCK },
  { selector: "ImportSpecifier[imported.name='performance']", message: WALL_CLOCK },
  // process.hrtime(), process.hrtime.bigint(), process.uptime(), const { hrtime } = process
  { selector: 'MemberExpression[property.name=/^(hrtime|uptime)$/]', message: WALL_CLOCK },
  { selector: 'ObjectPattern > Property[key.name=/^(hrtime|uptime)$/]', message: WALL_CLOCK },
  // setTimeout and setInterval: global, imported, destructured, or as a member
  { selector: `CallExpression[callee.name=${TIMER}]`, message: REAL_TIMER },
  { selector: `MemberExpression[property.name=${TIMER}]`, message: REAL_TIMER },
  { selector: `MemberExpression[property.value=${TIMER}]`, message: REAL_TIMER },
  { selector: `ImportSpecifier[imported.name=${TIMER}]`, message: REAL_TIMER },
  { selector: `ObjectPattern > Property[key.name=${TIMER}]`, message: REAL_TIMER },
  // scheduler.wait() from node:timers/promises
  { selector: "ImportSpecifier[imported.name='scheduler']", message: REAL_TIMER },
  { selector: "ObjectPattern > Property[key.name='scheduler']", message: REAL_TIMER },
  { selector: "MemberExpression[property.name='wait'][object.name='scheduler']", message: REAL_TIMER },
  { selector: "MemberExpression[property.name='wait'][object.property.name='scheduler']", message: REAL_TIMER },
  // vi.waitFor and vi.waitUntil poll on real timers against a real deadline
  { selector: "MemberExpression[object.name='vi'][property.name=/^wait(For|Until)$/]", message: REAL_TIMER },
].map((entry) => Object.freeze(entry)));
