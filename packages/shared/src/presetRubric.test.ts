import { describe, expect, it } from 'vitest';
import { PRESET_RUBRICS } from './presetRubric.js';
import { CreateRubricSchema } from './schemas/rubrics.js';
import { MEETING_TYPES } from './enums.js';

/**
 * The presets are installed through the same validation as a rubric created in
 * the Criteria screen, so every preset must satisfy the API limits (code,
 * title, description, descriptor and reference lengths; weight range).
 */
describe('preset rubrics', () => {
  it('flags at most one preset per meeting type as the default', () => {
    const defaults = PRESET_RUBRICS.filter((p) => p.isDefault);
    const byType = new Map(defaults.map((p) => [p.meetingType, p]));
    expect(byType.size).toBe(defaults.length);
  });

  for (const preset of PRESET_RUBRICS) {
    describe(preset.name, () => {
      it('validates against CreateRubricSchema', () => {
        const parsed = CreateRubricSchema.safeParse({
          name: preset.name,
          description: preset.description,
          meetingType: preset.meetingType,
          gradeBands: preset.gradeBands,
          categories: preset.categories.map((c, ci) => ({
            name: c.name,
            description: c.description,
            order: ci,
            criteria: c.criteria.map((k, ki) => ({ ...k, order: ki })),
          })),
        });
        if (!parsed.success) {
          throw new Error(JSON.stringify(parsed.error.issues, null, 2));
        }
      });

      it('uses a known meeting type', () => {
        expect(MEETING_TYPES).toContain(preset.meetingType);
      });

      it('has unique criterion codes and non-empty descriptors', () => {
        const codes = preset.categories.flatMap((c) => c.criteria.map((k) => k.code));
        expect(new Set(codes).size).toBe(codes.length);
        for (const c of preset.categories) {
          expect(c.criteria.length).toBeGreaterThan(0);
          for (const k of c.criteria) {
            expect(k.descriptors['1'].length).toBeGreaterThan(0);
            expect(k.descriptors['3'].length).toBeGreaterThan(0);
            expect(k.descriptors['5'].length).toBeGreaterThan(0);
            expect(k.frameworkRefs.length).toBeGreaterThan(0);
          }
        }
      });

      it('has grade bands listed highest first and ending at 0', () => {
        const mins = preset.gradeBands.map((b) => b.min);
        expect(mins[mins.length - 1]).toBe(0);
        for (let i = 1; i < mins.length; i++) expect(mins[i]).toBeLessThan(mins[i - 1]!);
      });

      it('flags some but not all criteria as mandatory', () => {
        const all = preset.categories.flatMap((c) => c.criteria);
        const mandatory = all.filter((k) => k.isMandatory);
        expect(mandatory.length).toBeGreaterThan(0);
        expect(mandatory.length).toBeLessThan(all.length);
      });
    });
  }
});
