import { describe, expect, it } from 'vitest';
import { getBirthdayTargetDates, getWeekBoundaries } from '@/lib/digest-dates';

describe('getBirthdayTargetDates', () => {
  it('returns Fri+Sat+Sun on Friday', () => {
    const friday = new Date('2026-02-27T12:00:00Z');
    expect(getBirthdayTargetDates(friday)).toEqual(['02-27', '02-28', '03-01']);
  });

  it('returns only today on non-Friday', () => {
    const tuesday = new Date('2026-02-24T12:00:00Z');
    expect(getBirthdayTargetDates(tuesday)).toEqual(['02-24']);
  });
});

describe('getWeekBoundaries', () => {
  it('returns Monday start and Friday end for a mid-week day', () => {
    const reference = new Date('2026-02-18T20:00:00Z');
    const bounds = getWeekBoundaries(reference);
    expect(bounds.start.getDay()).toBe(1);
    expect(bounds.end.getDay()).toBe(5);
    expect(bounds.start.getHours()).toBe(0);
    expect(bounds.end.getHours()).toBe(23);
  });

  it('handles week crossing into a new year', () => {
    const reference = new Date('2026-01-01T10:00:00Z');
    const bounds = getWeekBoundaries(reference);
    expect(bounds.start.getFullYear()).toBe(2025);
    expect(bounds.start.getMonth()).toBe(11); // Dec
    expect(bounds.start.getDate()).toBe(29);
    expect(bounds.end.getFullYear()).toBe(2026);
    expect(bounds.end.getMonth()).toBe(0); // Jan
    expect(bounds.end.getDate()).toBe(2);
  });
});
