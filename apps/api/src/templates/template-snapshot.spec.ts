import { describe, expect, it } from 'vitest';
import {
  LEGACY_QUOTATION_TEMPLATE,
  readTemplateSnapshot,
  templateOfStoredView,
  toTemplateView,
} from './template-snapshot';

describe('template snapshots', () => {
  it('reads a stored snapshot', () => {
    expect(
      readTemplateSnapshot({ templateId: 't-1', key: 'bold', name: 'x', accentColor: '#EA580C' }),
    ).toEqual({ templateId: 't-1', key: 'bold', name: 'Bold', accentColor: '#ea580c' });
  });

  it.each([
    null,
    undefined,
    'modern',
    {},
    { key: 'fancy', accentColor: '#000000' },
    { key: 'modern', accentColor: 'red' },
  ])('rejects %j', (value) => {
    expect(readTemplateSnapshot(value)).toBeNull();
  });

  it('keeps the legacy Classic blue for versions stored before templates', () => {
    expect(templateOfStoredView(undefined)).toEqual(LEGACY_QUOTATION_TEMPLATE);
    expect(templateOfStoredView({ key: 'elegant', accentColor: '#9f1239', locked: true })).toEqual({
      key: 'elegant',
      name: 'Elegant',
      accentColor: '#9f1239',
      locked: true,
    });
  });

  it('builds the view with the lock flag', () => {
    expect(toTemplateView({ key: 'minimal', accentColor: '#0F766E' }, false)).toEqual({
      key: 'minimal',
      name: 'Minimal',
      accentColor: '#0f766e',
      locked: false,
    });
  });
});
