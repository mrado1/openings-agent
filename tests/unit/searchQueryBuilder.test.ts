import { SearchQueryBuilder } from '../../src/discovery/searchQueryBuilder';

describe('SearchQueryBuilder', () => {
  const builder = new SearchQueryBuilder();
  
  it('should build multiple search strategies', () => {
    const context = {
      title: 'Telos Tales',
      artist: 'Alicja Kwade',
      gallery: 'Pace',
      year: '2025'
    };
    
    const queries = builder.buildSearchQueries(context);
    
    expect(queries).toContain('"Telos Tales" Alicja Kwade Pace 2025');
    expect(queries).toContain('Alicja Kwade Pace 2025 exhibition');
    expect(queries.length).toBeGreaterThan(2);
  });

  it('should handle long titles with partial matching', () => {
    const context = {
      title: 'A Very Long Exhibition Title With Many Words',
      artist: 'Test Artist',
      gallery: 'Test Gallery',
      year: '2025'
    };
    
    const queries = builder.buildSearchQueries(context);
    
    expect(queries.some(q => q.includes('"A Very Long"'))).toBe(true);
  });

  it('should build contextual queries with additional terms', () => {
    const context = {
      title: 'Test Show',
      artist: 'Test Artist',
      gallery: 'Test Gallery',
      year: '2025'
    };
    
    const query = builder.buildContextualQuery(context, ['paintings', 'contemporary']);
    
    expect(query).toContain('Test Artist');
    expect(query).toContain('Test Gallery');
    expect(query).toContain('2025');
    expect(query).toContain('paintings');
    expect(query).toContain('contemporary');
  });

  it('should sanitize query strings properly', () => {
    const input = 'Artist   Name & Gallery!! 2025';
    const sanitized = builder.sanitizeQuery(input);
    
    expect(sanitized).not.toContain('&');
    expect(sanitized).not.toContain('!');
    expect(sanitized).not.toContain('   '); // Multiple spaces
    expect(sanitized).toContain('Artist Name');
    expect(sanitized).toContain('Gallery');
    expect(sanitized).toContain('2025');
  });
}); 