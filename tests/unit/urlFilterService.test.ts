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

  it('should score domain indicators correctly', () => {
    const searchResults = [
      {
        title: 'Random Site',
        link: 'https://randomsite.com/about',
        snippet: 'Learn about our company...',
        displayLink: 'randomsite.com'
      },
      {
        title: 'Gallery Current Shows',
        link: 'https://artgallery.com/exhibitions/current',
        snippet: 'New exhibition featuring contemporary art...',
        displayLink: 'artgallery.com'
      }
    ];
    
    const filtered = filter.filterGalleryUrls(searchResults);
    
    // Find results by URL
    const galleryResult = filtered.find(f => f.url.includes('artgallery.com'));
    const randomResult = filtered.find(f => f.url.includes('randomsite.com'));
    
    // Gallery domain should be ranked higher due to gallery indicators
    expect(galleryResult).toBeDefined();
    expect(galleryResult!.confidence).toBeGreaterThan(randomResult?.confidence || 0);
  });

  it('should score exhibition paths higher', () => {
    const searchResults = [
      {
        title: 'About Page',
        link: 'https://example.com/about',
        snippet: 'Learn about our company...',
        displayLink: 'example.com'
      },
      {
        title: 'Current Exhibition',
        link: 'https://example.com/exhibitions/current-show',
        snippet: 'New exhibition featuring contemporary artworks...',
        displayLink: 'example.com'
      }
    ];
    
    const filtered = filter.filterGalleryUrls(searchResults);
    
    // Find results by URL
    const aboutResult = filtered.find(f => f.url.includes('/about'));
    const exhibitionResult = filtered.find(f => f.url.includes('/exhibitions/'));
    
    // Exhibition path should have higher confidence due to path boost
    expect(aboutResult).toBeDefined();
    expect(exhibitionResult).toBeDefined();
    expect(exhibitionResult!.confidence).toBeGreaterThan(aboutResult!.confidence);
  });
}); 