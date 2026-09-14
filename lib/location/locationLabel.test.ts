import { describe, expect, it, vi } from 'vitest';
import { formatLocationLabel } from './locationLabel';

vi.mock('expo-location', () => ({
  reverseGeocodeAsync: vi.fn(),
}));

const emptyAddress = {
  city: null,
  district: null,
  subregion: null,
  region: null,
  country: null,
};

describe('formatLocationLabel', () => {
  it('prefers a city over broader administrative areas', () => {
    expect(formatLocationLabel({
      ...emptyAddress,
      city: 'London',
      subregion: 'Greater London',
      region: 'England',
    })).toBe('London');
  });

  it('falls back through district, subregion, region, and country', () => {
    expect(formatLocationLabel({ ...emptyAddress, district: 'Coventry' })).toBe('Coventry');
    expect(formatLocationLabel({ ...emptyAddress, subregion: 'West Midlands' })).toBe('West Midlands');
    expect(formatLocationLabel({ ...emptyAddress, region: 'England' })).toBe('England');
    expect(formatLocationLabel({ ...emptyAddress, country: 'United Kingdom' })).toBe('United Kingdom');
  });

  it('ignores blank values and returns null when no name exists', () => {
    expect(formatLocationLabel({ ...emptyAddress, city: '  ', region: ' England ' })).toBe('England');
    expect(formatLocationLabel(emptyAddress)).toBeNull();
  });
});
