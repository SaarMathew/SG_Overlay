import type { connect } from '../lib/state.svelte.ts';

export type App = ReturnType<typeof connect>['state'];
export type Action = ReturnType<typeof connect>['action'];

/** "Ctrl+Alt+1" -> ["Ctrl", "Alt", "1"] for <kbd> labels */
export const keys = (combo: string | undefined) => (combo ? combo.split('+').map(s => s.trim()) : []);
