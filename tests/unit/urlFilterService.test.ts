import { UrlFilterService } from '../../src/services/urlFilterService';

describe('UrlFilterService', () => {
  const filter = new UrlFilterService();
  
  it('should identify gallery URLs', () => {
    const searchResults = [
      {
        title: 'Current Exhibition - Pace Gallery',
        link: 'https://pacegallery.com/exhibitions/current',
        snippet: 'New sculptures by contemporary artist...',
        displayLink: 'pacegallery.com'
      },
      {
        title: 'Instagram Post about Art Show',
        link: 'https://instagram.com/p/abc123',
        snippet: 'Check out this amazing exhibition...',
        displayLink: 'instagram.com'
      }
    ];
    
    const filtered = filter.filterGalleryUrls(searchResults);
    
    expect(filtered.length).toBe(1);
    expect(filtered[0].url).toContain('pacegallery.com');
    expect(filtered[0].confidence).toBeGreaterThan(0.5);
  });

  it('should filter out social media and news sites', () => {
    const searchResults = [
      {
        title: 'Gallery Exhibition Page',
        link: 'https://examplegallery.com/shows/current',
        snippet: 'New exhibition opening...',
        displayLink: 'examplegallery.com'
      },
      {
        title: 'Facebook Event About Art',
        link: 'https://facebook.com/events/123',
        snippet: 'Come see this amazing art exhibition opening...',
        displayLink: 'facebook.com'
      },
      {
        title: 'News Review Article',
        link: 'https://artforum.com/news/review-artist-show',
        snippet: 'Critical review of the latest museum exhibition...',
        displayLink: 'artforum.com'
      }
    ];
    
    const filtered = filter.filterGalleryUrls(searchResults);
    
    // Gallery should be first (highest confidence)
    expect(filtered[0].url).toContain('examplegallery.com');
    // Facebook should have low confidence due to social media penalty
    const facebookResult = filtered.find(f => f.url.includes('facebook.com'));
    if (facebookResult) {
      expect(facebookResult.confidence).toBeLessThan(0.5);
    }
  });

  it('should boost known gallery domains', () => {
    const searchResults = [
      {
        title: 'Random Gallery',
        link: 'https://unknowngallery.com/about',
        snippet: 'Learn about our space...',
        displayLink: 'unknowngallery.com'
      },
      {
        title: 'Gagosian Current Shows',
        link: 'https://gagosian.com/exhibitions/current',
        snippet: 'New exhibition featuring contemporary art...',
        displayLink: 'gagosian.com'
      }
    ];
    
    const filtered = filter.filterGalleryUrls(searchResults);
    
    // Find results by URL since order may vary
    const gagosianResult = filtered.find(f => f.url.includes('gagosian.com'));
    const unknownResult = filtered.find(f => f.url.includes('unknowngallery.com'));
    
    // Gagosian should be ranked higher due to known gallery boost
    expect(gagosianResult).toBeDefined();
    expect(unknownResult).toBeDefined();
    // Check that Gagosian appears first in the sorted results (higher confidence)
    expect(filtered[0].url).toContain('gagosian.com');
  });

  it('should score exhibition paths higher', () => {
    const searchResults = [
      {
        title: 'About Page',
        link: 'https://testgallery.com/about',
        snippet: 'Learn about our gallery...',
        displayLink: 'testgallery.com'
      },
      {
        title: 'Current Exhibition',
        link: 'https://testgallery.com/exhibitions/current-show',
        snippet: 'New exhibition featuring contemporary artworks...',
        displayLink: 'testgallery.com'
      }
    ];
    
    const filtered = filter.filterGalleryUrls(searchResults);
    
    // Exhibition path should appear first due to higher confidence
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].url).toContain('/exhibitions/');
  });
}); 