// Themes for X: repaints X with the reader's theme and background. Finds the
// rules in X's own stylesheets that use its theme colours (see ./palette.ts) and
// adds one override stylesheet. X adds rules as new parts of the page render, so
// the scan reruns (cheaply) after Bot Meter's page scans.

import type { BotMeterCore } from '../core';
import { fail, isDisabled } from '../log';
import type { CreatorSettings } from '../settings';
import { type ColorRule, propKind, resolveTheme, roleOf, themeCss } from './palette';

const FEATURE = 'theme';
const STYLE_ID = 'bm-theme';
const IMAGE_KEY = 'backdropImage';
const PROPS = ['background-color', 'color', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];

/** Theme-colour rules in a stylesheet (including those inside @media blocks). */
export function colorRules(list: CSSRuleList): ColorRule[] {
  const out: ColorRule[] = [];
  for (const rule of list) {
    if (rule instanceof CSSMediaRule) {
      out.push(...colorRules(rule.cssRules));
      continue;
    }
    if (!(rule instanceof CSSStyleRule)) continue;
    for (const prop of PROPS) {
      const value = rule.style.getPropertyValue(prop);
      const kind = value ? propKind(prop) : null;
      if (kind && roleOf(kind, value)) out.push({ selector: rule.selectorText, prop, value });
    }
  }
  return out;
}

export function startTheme(core: BotMeterCore, watch: (fn: (settings: CreatorSettings) => void) => void): void {
  let settings: CreatorSettings | null = null;
  let image: string | null = null;
  // Rules found so far, and each stylesheet's size when last scanned.
  const found = new Map<string, ColorRule>();
  const scannedSize = new WeakMap<CSSStyleSheet, number>();
  let lastCss = '';

  watch((next) => {
    settings = next;
    apply();
  });
  chrome.storage.local.get(IMAGE_KEY, (stored) => {
    image = typeof stored[IMAGE_KEY] === 'string' ? (stored[IMAGE_KEY] as string) : null;
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(IMAGE_KEY in changes)) return;
    const value: unknown = changes[IMAGE_KEY]?.newValue;
    image = typeof value === 'string' ? value : null;
    apply();
  });
  core.onScan(() => {
    if (document.documentElement.classList.contains('bm-theme') && scan()) apply();
  });

  /** Picks up X's new rules; true if any were found. */
  function scan(): boolean {
    let added = false;
    for (const sheet of document.styleSheets) {
      if ((sheet.ownerNode as Element | null)?.id === STYLE_ID) continue;
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // another site's stylesheet: not readable, and not X's theme
      }
      if (scannedSize.get(sheet) === rules.length) continue;
      scannedSize.set(sheet, rules.length);
      for (const r of colorRules(rules)) {
        const id = `${r.selector}|${r.prop}`;
        if (!found.has(id)) {
          found.set(id, r);
          added = true;
        }
      }
    }
    return added;
  }

  function apply(): void {
    if (!settings || isDisabled(FEATURE)) return;
    try {
      const theme = settings.enabled
        ? resolveTheme(
            { theme: settings.theme, themeColor: settings.themeColor, backdrop: settings.backdrop, backdropDim: settings.backdropDim },
            image
          )
        : null;
      const root = document.documentElement;
      let style = document.getElementById(STYLE_ID);
      if (!theme) {
        root.classList.remove('bm-theme');
        style?.remove();
        lastCss = '';
        return;
      }
      scan();
      const css = themeCss(theme, [...found.values()]);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head ?? root).append(style);
      }
      if (css !== lastCss) {
        style.textContent = css;
        lastCss = css;
      }
      root.classList.add('bm-theme');
    } catch (error) {
      if (!fail(FEATURE, error)) {
        document.documentElement.classList.remove('bm-theme');
        document.getElementById(STYLE_ID)?.remove();
      }
    }
  }
}
