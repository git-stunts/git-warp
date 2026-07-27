import type { TextModifier, Theme, TokenValue } from '@flyingrobots/bijou';

/**
 * Reference colors for the migration shell.
 *
 * Design Book 0.5.0 selected `paper` through `bestContrastWith(ink, palette)`.
 * Bijou measures the resulting paper-on-ink pair at 18.94:1.
 */
const PALETTE = Object.freeze({
  accent: '#38bdf8',
  danger: '#fca5a5',
  ink: '#07111f',
  paper: '#ffffff',
  success: '#86efac',
  warning: '#fbbf24',
});

function foreground(hex: string, modifiers?: TextModifier[]): TokenValue {
  return {
    hex,
    ...(modifiers === undefined ? {} : { modifiers }),
  };
}

function surface(hex: string, background = PALETTE.ink): TokenValue {
  return {
    bg: background,
    hex,
  };
}

/** High-contrast semantic theme for the interactive v18-to-v19 migration shell. */
export const V18_MIGRATION_THEME: Theme = {
  name: 'git-warp-v18-to-v19',
  status: {
    active: foreground(PALETTE.accent),
    error: foreground(PALETTE.danger),
    info: foreground(PALETTE.accent),
    muted: foreground(PALETTE.paper),
    pending: foreground(PALETTE.paper),
    success: foreground(PALETTE.success),
    warning: foreground(PALETTE.warning),
  },
  semantic: {
    accent: foreground(PALETTE.accent),
    error: foreground(PALETTE.danger),
    info: foreground(PALETTE.accent),
    muted: foreground(PALETTE.paper),
    primary: foreground(PALETTE.paper, ['bold']),
    success: foreground(PALETTE.success),
    warning: foreground(PALETTE.warning),
  },
  gradient: {
    brand: [
      { color: [56, 189, 248], pos: 0 },
      { color: [134, 239, 172], pos: 1 },
    ],
    progress: [
      { color: [56, 189, 248], pos: 0 },
      { color: [134, 239, 172], pos: 1 },
    ],
  },
  border: {
    error: foreground(PALETTE.danger),
    muted: foreground(PALETTE.paper),
    primary: foreground(PALETTE.accent),
    secondary: foreground(PALETTE.paper),
    success: foreground(PALETTE.success),
    warning: foreground(PALETTE.warning),
  },
  ui: {
    cursor: foreground(PALETTE.warning),
    focusGutter: surface(PALETTE.accent),
    logo: foreground(PALETTE.accent),
    scrollThumb: foreground(PALETTE.accent),
    scrollTrack: foreground(PALETTE.paper),
    sectionHeader: foreground(PALETTE.paper, ['bold']),
    tableHeader: foreground(PALETTE.paper, ['bold']),
    trackEmpty: foreground(PALETTE.paper),
  },
  surface: {
    elevated: surface(PALETTE.paper),
    muted: surface(PALETTE.paper),
    overlay: surface(PALETTE.paper),
    primary: surface(PALETTE.paper),
    secondary: surface(PALETTE.paper),
  },
};
