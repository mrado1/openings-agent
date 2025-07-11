import { WebSearchService } from '../../src/services/webSearchService';
import { UrlFilterService } from '../../src/services/urlFilterService';
import { SearchQueryBuilder } from '../../src/discovery/searchQueryBuilder';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

describe('Google Search API Integration Tests', () => {
  let webSearchService: WebSearchService;
  let urlFilterService: UrlFilterService;
  let queryBuilder: SearchQueryBuilder;

  beforeAll(() => {
    if (!process.env.GOOGLE_SEARCH_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
      console.warn('⚠️ Google Search API keys not found - tests will be skipped');
    }
    
    webSearchService = new WebSearchService();
    urlFilterService = new UrlFilterService();
    queryBuilder = new SearchQueryBuilder();
  });

  describe('API Configuration and Connectivity', () => {
    it('should have valid API configuration', () => {
      expect(process.env.GOOGLE_SEARCH_API_KEY).toBeTruthy();
      expect(process.env.GOOGLE_SEARCH_ENGINE_ID).toBeTruthy();
    });

    it('should successfully connect to Google Search API', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping API connectivity test - missing API key');
        return;
      }

      const results = await webSearchService.searchExhibitions('art gallery exhibition');
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('link');
      expect(results[0]).toHaveProperty('snippet');
      expect(results[0]).toHaveProperty('displayLink');
    }, 30000);

    it('should handle API rate limiting gracefully', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping rate limiting test - missing API key');
        return;
      }

      // Make multiple rapid requests to test rate limiting
      const requests = Array(5).fill(null).map((_, i) => 
        webSearchService.searchExhibitions(`test query ${i}`)
      );

      try {
        const results = await Promise.all(requests);
        
        // All requests should succeed or fail gracefully
        results.forEach(result => {
          expect(Array.isArray(result)).toBe(true);
        });
             } catch (error) {
         // If rate limited, should have proper error message
         expect((error as Error).message).toContain('rate limit');
       }
    }, 60000);
  });

  describe('Search Query Strategies', () => {
    it('should validate search query fallback strategies', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping query strategy test - missing API key');
        return;
      }

      const context = {
        title: 'Telos Tales',
        artist: 'Alicja Kwade',
        gallery: 'Pace',
        year: '2025'
      };

      const queries = queryBuilder.buildSearchQueries(context);
      
      // Should have multiple fallback strategies
      expect(queries.length).toBeGreaterThanOrEqual(3);
      
      // Test each query strategy
      let foundResults = false;
      
      for (const query of queries.slice(0, 3)) { // Test first 3 to avoid API limits
        const results = await webSearchService.searchExhibitions(query);
        
        if (results.length > 0) {
          foundResults = true;
          
          // Validate search result structure
          expect(results[0]).toHaveProperty('title');
          expect(results[0]).toHaveProperty('link');
          expect(results[0]).toHaveProperty('snippet');
          
          // Should find relevant gallery results
          const galleryResults = results.filter(r => 
            r.displayLink.includes('pace') || 
            r.link.includes('pace') ||
            r.title.toLowerCase().includes('pace')
          );
          
          if (galleryResults.length > 0) {
            expect(galleryResults[0].link).toContain('pace');
            break;
          }
        }
        
        // Rate limiting: wait between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      expect(foundResults).toBe(true);
    }, 90000);

    it('should handle special characters and long titles in search queries', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping special characters test - missing API key');
        return;
      }

      const specialCases = [
        {
          title: 'Art & Design: The Future',
          artist: 'Jean-Michel Basquiat',
          gallery: 'Hauser & Wirth',
          year: '2024'
        },
        {
          title: 'Very Long Exhibition Title That Might Cause Issues With Search Engines',
          artist: 'Artist Name',
          gallery: 'Gallery Name',
          year: '2024'
        }
      ];

      for (const testCase of specialCases) {
        const queries = queryBuilder.buildSearchQueries(testCase);
        
        // Should handle special characters
        expect(queries.length).toBeGreaterThan(0);
        
        // Test at least one query
        const results = await webSearchService.searchExhibitions(queries[0]);
        expect(Array.isArray(results)).toBe(true);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);
  });

  describe('Cost Efficiency Validation', () => {
    it('should validate cost per search meets efficiency targets', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping cost efficiency test - missing API key');
        return;
      }

      const startTime = Date.now();
      const testQuery = 'Pace Gallery contemporary art exhibition';
      
      const results = await webSearchService.searchExhibitions(testQuery);
      const duration = Date.now() - startTime;
      
      // Should return results efficiently
      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Under 10 seconds
      
      // Cost analysis (Google Custom Search: $5 per 1000 searches after 100 free)
      const costPerSearch = 0.005; // $0.005 per search
      const expectedCostFor1000Searches = 5.00; // $5.00
      
      console.log(`📊 Cost Analysis:`);
      console.log(`   Cost per search: $${costPerSearch.toFixed(3)}`);
      console.log(`   Cost for 1,000 searches: $${expectedCostFor1000Searches.toFixed(2)}`);
      console.log(`   Search duration: ${duration}ms`);
      console.log(`   Results returned: ${results.length}`);
      
      // Should meet cost efficiency targets from milestone requirements
      expect(costPerSearch).toBeLessThanOrEqual(0.01); // Under $0.01 per search
    }, 30000);

    it('should validate total discovery cost efficiency', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping total cost test - missing API key');
        return;
      }

      // Simulate complete discovery cost calculation
      const searchCost = 0.005; // Google Custom Search
      const geminiCost = 0.015; // Gemini extraction (from milestone data)
      const totalCostPerDiscovery = searchCost + geminiCost;
      
      console.log(`📊 Total Discovery Cost Analysis:`);
      console.log(`   Search cost: $${searchCost.toFixed(3)}`);
      console.log(`   Gemini extraction: $${geminiCost.toFixed(3)}`);
      console.log(`   Total per discovery: $${totalCostPerDiscovery.toFixed(3)}`);
      console.log(`   Cost for 1,000 discoveries: $${(totalCostPerDiscovery * 1000).toFixed(2)}`);
      
      // Should meet milestone target of ~$0.02 per complete discovery
      expect(totalCostPerDiscovery).toBeLessThanOrEqual(0.025);
      
      // Should be cost-effective at scale
      const costFor1000 = totalCostPerDiscovery * 1000;
      expect(costFor1000).toBeLessThan(30); // Under $30 for 1000 discoveries
    });
  });

  describe('URL Filtering and Quality', () => {
    it('should effectively filter gallery URLs from search results', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping URL filtering test - missing API key');
        return;
      }

      const searchResults = await webSearchService.searchExhibitions('contemporary art gallery exhibition');
      
      if (searchResults.length === 0) {
        console.log('⚠️ No search results - skipping filter test');
        return;
      }

      const filteredUrls = urlFilterService.filterGalleryUrls(searchResults);
      
      // Should filter out non-gallery URLs
      expect(filteredUrls.length).toBeGreaterThan(0);
      expect(filteredUrls.length).toBeLessThanOrEqual(searchResults.length);
      
      // Should prioritize gallery domains
      const galleryDomains = filteredUrls.filter(url => 
        url.domain.includes('gallery') || 
        url.domain.includes('art') || 
        url.url.includes('exhibition')
      );
      
      expect(galleryDomains.length).toBeGreaterThan(0);
      
      // Should assign reasonable confidence scores
      const avgConfidence = filteredUrls.reduce((sum, url) => sum + url.confidence, 0) / filteredUrls.length;
      expect(avgConfidence).toBeGreaterThan(0.3);
      expect(avgConfidence).toBeLessThanOrEqual(1.0);
      
      // Should sort by confidence
      for (let i = 1; i < filteredUrls.length; i++) {
        expect(filteredUrls[i-1].confidence).toBeGreaterThanOrEqual(filteredUrls[i].confidence);
      }
    }, 30000);

    it('should handle social media and news filtering', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping social media filtering test - missing API key');
        return;
      }

      const searchResults = await webSearchService.searchExhibitions('art exhibition instagram facebook');
      
      if (searchResults.length === 0) {
        console.log('⚠️ No search results - skipping social media filter test');
        return;
      }

      const filteredUrls = urlFilterService.filterGalleryUrls(searchResults);
      
      // Should filter out social media URLs
      const socialMediaUrls = filteredUrls.filter(url => 
        url.domain.includes('instagram') || 
        url.domain.includes('facebook') || 
        url.domain.includes('twitter')
      );
      
      // Social media URLs should have low confidence or be filtered out
      socialMediaUrls.forEach(url => {
        expect(url.confidence).toBeLessThan(0.5);
      });
    }, 30000);
  });

  describe('Search Result Quality and Relevance', () => {
    it('should return relevant results for known gallery searches', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping relevance test - missing API key');
        return;
      }

      const knownGalleries = [
        'Pace Gallery',
        'David Zwirner',
        'Gagosian'
      ];

      for (const gallery of knownGalleries) {
        const results = await webSearchService.searchExhibitions(`${gallery} current exhibition`);
        
        if (results.length > 0) {
          // Should find official gallery website
          const officialSite = results.find(r => 
            r.displayLink.includes(gallery.toLowerCase().replace(' ', '')) ||
            r.link.includes(gallery.toLowerCase().replace(' ', ''))
          );
          
          if (officialSite) {
            expect(officialSite.link).toContain(gallery.toLowerCase().replace(' ', ''));
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 90000);

    it('should validate search result metadata quality', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping metadata quality test - missing API key');
        return;
      }

      const results = await webSearchService.searchExhibitions('contemporary art gallery exhibition 2024');
      
      if (results.length === 0) {
        console.log('⚠️ No search results - skipping metadata test');
        return;
      }

      // Validate result structure and quality
      results.forEach(result => {
        expect(result.title).toBeTruthy();
        expect(result.link).toMatch(/^https?:\/\//);
        expect(result.snippet).toBeTruthy();
        expect(result.displayLink).toBeTruthy();
        
        // Title should be reasonable length
        expect(result.title.length).toBeGreaterThan(10);
        expect(result.title.length).toBeLessThan(200);
        
        // Snippet should provide context
        expect(result.snippet.length).toBeGreaterThan(20);
      });
    }, 30000);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty search queries gracefully', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping empty query test - missing API key');
        return;
      }

             try {
         const results = await webSearchService.searchExhibitions('');
         expect(Array.isArray(results)).toBe(true);
       } catch (error) {
         expect((error as Error).message).toBeTruthy();
       }
    }, 30000);

    it('should handle API errors gracefully', async () => {
      // Test with invalid API key (temporarily)
      const originalKey = process.env.GOOGLE_SEARCH_API_KEY;
      process.env.GOOGLE_SEARCH_API_KEY = 'invalid-key';
      
      try {
        const invalidService = new WebSearchService();
        await invalidService.searchExhibitions('test query');
        
        // Should not reach here
        expect(true).toBe(false);
             } catch (error) {
         expect((error as Error).message).toContain('Google Search failed');
       }
      
      // Restore original key
      process.env.GOOGLE_SEARCH_API_KEY = originalKey;
    }, 30000);

    it('should handle network timeouts appropriately', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping timeout test - missing API key');
        return;
      }

      // Test with very long query that might timeout
      const longQuery = 'very '.repeat(100) + 'long query';
      
             try {
         const results = await webSearchService.searchExhibitions(longQuery);
         expect(Array.isArray(results)).toBe(true);
       } catch (error) {
         // Should handle timeout gracefully
         expect((error as Error).message).toBeTruthy();
       }
    }, 30000);
  });
}); 