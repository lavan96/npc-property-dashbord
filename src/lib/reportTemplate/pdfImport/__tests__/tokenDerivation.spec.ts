/**
 * Token derivation: document-level colors/fonts derived from extraction
 * observations (replacing the old hard-coded gold/white/Helvetica tokens).
 */
import { describe, it, expect } from 'vitest';
import { deriveTokensFromExtraction, pickInkColor, type FillObservation, type TextObservation } from '../tokenDerivation';

const A4_AREA = 595 * 842;

describe('deriveTokensFromExtraction', () => {
  it('falls back to defaults when there are no observations (pixel mode)', () => {
    const t = deriveTokensFromExtraction([], []);
    expect(t.colors).toEqual({ primary: '#BF9B50', bg: '#FFFFFF', text: '#111111', muted: '#666666' });
    expect(t.fonts).toEqual({ heading: 'Helvetica', body: 'Helvetica' });
  });

  it('picks the dominant body text colour and a muted secondary', () => {
    const texts: TextObservation[] = [
      { color: '#222222', fontFamily: 'Inter', fontSize: 11, chars: 4000 },
      { color: '#888888', fontFamily: 'Inter', fontSize: 9, chars: 600 },
      { color: '#0055AA', fontFamily: 'Inter', fontSize: 11, chars: 80 },
    ];
    const t = deriveTokensFromExtraction(texts, [], { pageArea: A4_AREA });
    expect(t.colors.text).toBe('#222222');
    expect(t.colors.muted).toBe('#888888');
  });

  it('selects the most prominent saturated colour as primary (text counts extra)', () => {
    const texts: TextObservation[] = [
      { color: '#111111', fontFamily: 'Lato', fontSize: 11, chars: 5000 },
      { color: '#C8102E', fontFamily: 'Lato', fontSize: 24, chars: 120 }, // brand red headings
    ];
    const fills: FillObservation[] = [
      { color: '#EEEEEE', area: A4_AREA * 0.3 }, // grey panel — not saturated
      { color: '#1F6FEB', area: 2_000 },         // small blue chip
    ];
    const t = deriveTokensFromExtraction(texts, fills, { pageArea: A4_AREA });
    expect(t.colors.primary).toBe('#C8102E');
  });

  it('derives the page background from a large light fill', () => {
    const fills: FillObservation[] = [
      { color: '#0B1B2B', area: A4_AREA * 0.2 },  // dark card
      { color: '#F6F1E7', area: A4_AREA * 0.98 }, // cream full-bleed background
    ];
    const t = deriveTokensFromExtraction([], fills, { pageArea: A4_AREA });
    expect(t.colors.bg).toBe('#F6F1E7');
  });

  it('does not adopt a dark full-bleed fill as bg', () => {
    const fills: FillObservation[] = [{ color: '#101010', area: A4_AREA }];
    const t = deriveTokensFromExtraction([], fills, { pageArea: A4_AREA });
    expect(t.colors.bg).toBe('#FFFFFF');
  });

  it('assigns body to the most-used family and heading to the larger one', () => {
    const texts: TextObservation[] = [
      { color: '#111111', fontFamily: 'Lato', fontSize: 10.5, chars: 6000 },
      { color: '#111111', fontFamily: 'Playfair Display', fontSize: 30, chars: 90 },
    ];
    const t = deriveTokensFromExtraction(texts, [], { pageArea: A4_AREA });
    expect(t.fonts.body).toBe('Lato');
    expect(t.fonts.heading).toBe('Playfair Display');
  });

  it('uses the body family for headings when no clearly larger family exists', () => {
    const texts: TextObservation[] = [
      { color: '#111111', fontFamily: 'Inter', fontSize: 11, chars: 3000 },
      { color: '#111111', fontFamily: 'Courier', fontSize: 11, chars: 200 },
    ];
    const t = deriveTokensFromExtraction(texts, [], { pageArea: A4_AREA });
    expect(t.fonts.heading).toBe('Inter');
    expect(t.fonts.body).toBe('Inter');
  });

  it('accepts CSS rgb()/rgba() computed colours (DOM box trees)', () => {
    const texts: TextObservation[] = [
      { color: 'rgb(20, 20, 20)', fontFamily: 'Inter', fontSize: 12, chars: 2000 },
    ];
    const fills: FillObservation[] = [
      { color: 'rgba(246, 241, 231, 0.99)', area: A4_AREA },
    ];
    const t = deriveTokensFromExtraction(texts, fills, { pageArea: A4_AREA });
    expect(t.colors.text).toBe('#141414');
    expect(t.colors.bg).toBe('#F6F1E7');
  });
});

describe('pickInkColor', () => {
  const px = (rgb: [number, number, number], n: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(rgb[0], rgb[1], rgb[2], 255);
    return out;
  };

  it('returns the dark minority (glyph ink) over the light majority (paper)', () => {
    const pixels = [...px([250, 250, 250], 60), ...px([180, 20, 30], 20)];
    expect(pickInkColor(pixels)).toBe('#B4141E');
  });

  it('returns undefined for a flat region (no glyph contrast)', () => {
    expect(pickInkColor(px([240, 240, 240], 80))).toBeUndefined();
  });

  it('returns undefined when there are too few opaque pixels', () => {
    expect(pickInkColor([0, 0, 0, 0, 255, 255, 255, 255])).toBeUndefined();
  });
});
