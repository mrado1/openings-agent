export interface ShowSearchContext {
  title: string;
  artist: string;
  gallery: string;
  year: string;
}

export class SearchQueryBuilder {
  buildSearchQueries(context: ShowSearchContext): string[] {
    const { title, artist, gallery, year } = context;
    
    const queries: string[] = [];
    
    // Primary strategy: Full show title with quotes
    if (title.length <= 50) { // Reasonable title length
      queries.push(`"${title}" ${artist} ${gallery} ${year}`);
    }
    
    // Fallback 1: Partial title (first 3-4 words)
    const titleWords = title.split(' ');
    if (titleWords.length > 3) {
      const partialTitle = titleWords.slice(0, 3).join(' ');
      queries.push(`"${partialTitle}" ${artist} ${gallery} ${year}`);
    }
    
    // Fallback 2: Title + artist + gallery (no year)
    queries.push(`"${title}" ${artist} ${gallery}`);
    
    // Backup strategy: Artist + gallery + year
    queries.push(`${artist} ${gallery} ${year} exhibition`);
    
    // Last resort: Artist + gallery
    queries.push(`${artist} ${gallery} current exhibition`);
    
    return queries;
  }

  buildContextualQuery(context: ShowSearchContext, additionalTerms: string[] = []): string {
    const baseTerms = [context.artist, context.gallery, context.year];
    const allTerms = [...baseTerms, ...additionalTerms].filter(Boolean);
    return allTerms.join(' ');
  }

  // Helper to clean up query strings
  sanitizeQuery(query: string): string {
    // Remove extra spaces, handle special characters
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s"'-]/g, ''); // Keep quotes, hyphens, apostrophes
  }
} 