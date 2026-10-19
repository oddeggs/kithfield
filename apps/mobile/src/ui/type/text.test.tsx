import { afterEach, describe, expect, it } from '@jest/globals';
import { fonts } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LocaleScope } from '../locale/locale-provider';
import { ThemeScope } from '../theme/theme-provider';
import { Txt } from './text';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Tree {
  root: { findAllByType(type: unknown): { props: { style?: TextStyle } }[] };
}

const renderers: ReactTestRenderer[] = [];
afterEach(async () => {
  await act(() => {
    for (const r of renderers.splice(0)) r.unmount();
  });
});

/** The style the outermost native Text is drawn with. */
async function styleOf(node: ReactNode, language: 'en' | 'vi' = 'en'): Promise<TextStyle> {
  await act(() => {
    renderers.push(
      create(
        <LocaleScope language={language}>
          <ThemeScope appearance="day">{node}</ThemeScope>
        </LocaleScope>,
      ),
    );
  });
  const renderer = renderers.at(-1);
  if (!renderer) throw new Error('not rendered');
  // The local typings carry only what the hook tests use; the renderer has its tree too.
  const { root } = renderer as unknown as Tree;
  return StyleSheet.flatten(root.findAllByType(Text)[0]?.props.style as never) as TextStyle;
}

describe('hand text', () => {
  it('sets English in Kithfield Hand at the design’s size', async () => {
    const style = await styleOf(<Txt variant="handS">see you soon</Txt>);
    expect(style.fontFamily).toBe(fonts.hand);
    expect(style.fontSize).toBe(15);
  });

  it('sets a Vietnamese name in English in the same face and size', async () => {
    const style = await styleOf(<Txt variant="handS">Nguyễn Ngọc Ánh</Txt>);
    expect(style.fontFamily).toBe(fonts.hand);
    expect(style.fontSize).toBe(15);
  });

  it('sets Vietnamese in Kithfield Hand too, with the taller line its marks need', async () => {
    const style = await styleOf(<Txt variant="handS">hẹn gặp lại</Txt>, 'vi');
    expect(style.fontFamily).toBe(fonts.hand);
    expect(style.fontSize).toBe(15);
    expect(style.lineHeight).toBe(21);
  });
});

describe('display text', () => {
  it('sets a screen’s own size in Fraunces at the size that keeps its box', async () => {
    const style = await styleOf(
      <Txt variant="displayM" style={{ fontSize: 24, lineHeight: 26.4 }}>
        The Thursday Lot
      </Txt>,
    );
    expect(style.fontFamily).toBe(fonts.display36);
    expect(style.fontSize).toBe(25.75);
    expect(style.lineHeight).toBe(26.4);
  });

  it('sets Vietnamese in Fraunces too', async () => {
    expect((await styleOf(<Txt variant="displayS">Nguyễn</Txt>, 'vi')).fontFamily).toBe(
      fonts.display18,
    );
  });
});
