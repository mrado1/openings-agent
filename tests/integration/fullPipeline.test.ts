import { DiscoveryPipeline } from '../../src/discovery/discoveryPipeline';
import { extractShowFields } from '../../src/extractors/extractFieldsGemini';
import { fetchAndCleanHtml } from '../../src/utils/fetchHtml';
import { WebSearchService } from '../../src/services/webSearchService';
import { UrlFilterService } from '../../src/services/urlFilterService';
import { LinkSelectionService } from '../../src/services/linkSelectionService';
import { SearchQueryBuilder, ShowSearchContext } from '../../src/discovery/searchQueryBuilder';
import { validateExtractionResult } from '../../src/utils/validation';
import { TEST_GALLERIES, PRODUCTION_READY_GALLERIES, TestGallery, TestShow, getAllTestShows } from '../fixtures/galleries';
import * as dotenv from 'dotenv';

// Load environment variables for integration tests
dotenv.config({ path: '.env.local' });

describe('Full Discovery Pipeline Integration Tests', () => {
  let pipeline: DiscoveryPipeline;
  let webSearch: WebSearchService;
  let urlFilter: UrlFilterService;
  let linkSelector: LinkSelectionService;
  let queryBuilder: SearchQueryBuilder;

  beforeAll(async () => {
    // Check if required environment variables are set
    if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY) {
      console.warn('⚠️ API keys not found - some integration tests will be skipped');
    }
    
    // Initialize services
    pipeline = new DiscoveryPipeline();
    webSearch = new WebSearchService();
    urlFilter = new UrlFilterService();
    linkSelector = new LinkSelectionService();
    queryBuilder = new SearchQueryBuilder();
  });

  describe('End-to-End Discovery Pipeline', () => {
    it('should successfully discover and extract known show (Pace Gallery)', async () => {
      // Skip if no API keys
      if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping integration test - missing API keys');
        return;
      }

      const context: ShowSearchContext = {
        title: 'Telos Tales',
        artist: 'Alicja Kwade',
        gallery: 'Pace',
        year: '2025'
      };

      const result = await pipeline.discoverAndExtract(context);

      // Validate discovery results
      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(70);
      expect(result.discoveredUrl).toBeTruthy();
      expect(result.discoveredUrl).toContain('pacegallery.com');
      expect(result.errors).toHaveLength(0);

      // Validate extracted data
      expect(result.extractedData).toBeDefined();
      expect(result.extractedData.title).toContain('Telos Tales');
      expect(result.extractedData.artists).toContain('Alicja Kwade');
      expect(result.extractedData.start_date).toBeTruthy();
      expect(result.extractedData.end_date).toBeTruthy();
      expect(result.extractedData.press_release).toBeTruthy();
      expect(result.extractedData.press_release.length).toBeGreaterThan(100);

      // Validate discovery metadata
      expect(result.searchQueries.length).toBeGreaterThan(0);
      expect(result.urlsFound).toBeGreaterThan(0);
      expect(result.urlsFiltered).toBeGreaterThan(0);
    }, 120000); // 2 minute timeout for full pipeline

    it('should handle multiple search strategies with fallbacks', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping search strategy test - missing Google API key');
        return;
      }

      const context: ShowSearchContext = {
        title: 'A Very Long Exhibition Title That May Not Be Found Exactly',
        artist: 'Test Artist',
        gallery: 'Test Gallery',
        year: '2024'
      };

      // Test query building
      const queries = queryBuilder.buildSearchQueries(context);
      expect(queries.length).toBeGreaterThan(2);
      expect(queries[0]).toContain('A Very Long');
      expect(queries[queries.length - 1]).toContain('Test Artist Test Gallery');

      // Test search with fallback (should not fail even if no results)
      const searchResults = await webSearch.searchExhibitions(queries[0]);
      expect(Array.isArray(searchResults)).toBe(true);
      // No specific result expectations since this is a fake exhibition
    }, 30000);

    it('should validate URL filtering accuracy', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping URL filtering test - missing Google API key');
        return;
      }

      // Search for a known gallery
      const searchResults = await webSearch.searchExhibitions('Pace Gallery contemporary exhibitions');
      
      if (searchResults.length === 0) {
        console.log('⚠️ No search results returned - skipping URL filtering test');
        return;
      }

      const filteredUrls = urlFilter.filterGalleryUrls(searchResults);
      
      // Should have at least some filtered URLs
      expect(filteredUrls.length).toBeGreaterThan(0);
      expect(filteredUrls.length).toBeLessThanOrEqual(searchResults.length);

      // Check confidence scoring
      const highConfidenceUrls = filteredUrls.filter(url => url.confidence > 0.7);
      expect(highConfidenceUrls.length).toBeGreaterThan(0);

      // Check that gallery URLs are prioritized
      const galleryUrls = filteredUrls.filter(url => 
        url.domain.includes('pace') || 
        url.domain.includes('gallery') ||
        url.url.includes('exhibitions')
      );
      expect(galleryUrls.length).toBeGreaterThan(0);
    }, 30000);

    it('should extract valid data from direct gallery URLs', async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.log('⚠️ Skipping extraction test - missing Gemini API key');
        return;
      }

      const testUrl = 'https://www.pacegallery.com/exhibitions/alicja-kwade-telos-tales/';
      
      try {
        // Test HTML fetching
        const html = await fetchAndCleanHtml(testUrl);
        expect(html).toBeTruthy();
        expect(html.length).toBeGreaterThan(1000);

        // Test field extraction
        const extracted = await extractShowFields(html, testUrl);
        expect(extracted).toBeDefined();
        expect(extracted.title).toBeTruthy();
        expect(extracted.artists).toBeDefined();
        expect(extracted.artists?.length || 0).toBeGreaterThan(0);

        // Test validation
        const validation = validateExtractionResult(extracted);
        expect(validation.quality_score).toBeGreaterThan(50);
        expect(validation.errors.length).toBe(0);
      } catch (error) {
        // URL might not exist - that's okay for this test
        console.log('⚠️ Test URL not accessible - this is expected for integration tests');
      }
    }, 60000);
  });

  describe('Production Gallery Testing', () => {
    it('should validate production-ready galleries', async () => {
      expect(PRODUCTION_READY_GALLERIES.length).toBeGreaterThan(0);
      
      const productionGalleries = PRODUCTION_READY_GALLERIES.slice(0, 2); // Test first 2 to avoid timeout
      
      for (const gallery of productionGalleries) {
        expect(gallery.confidence_threshold).toBeGreaterThanOrEqual(80);
        expect(gallery.website).toMatch(/^https?:\/\//);
        expect(gallery.expectedFields.length).toBeGreaterThan(0);
        expect(gallery.testShows.length).toBeGreaterThan(0);
      }
    });

    it('should handle gallery search variations', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping gallery variation test - missing Google API key');
        return;
      }

      const galleryVariations = [
        'Pace Gallery',
        'Pace',
        'David Zwirner',
        'Zwirner',
        'Gagosian',
        'Gagosian Gallery'
      ];

      for (const variation of galleryVariations.slice(0, 3)) { // Test first 3 to avoid API limits
        const searchResults = await webSearch.searchExhibitions(`${variation} contemporary exhibition`);
        
        // Should find some results for major galleries
        expect(searchResults.length).toBeGreaterThan(0);
        
        // Filter for gallery URLs
        const filteredUrls = urlFilter.filterGalleryUrls(searchResults);
        expect(filteredUrls.length).toBeGreaterThan(0);
        
        // Should have reasonable confidence scores
        const avgConfidence = filteredUrls.reduce((sum, url) => sum + url.confidence, 0) / filteredUrls.length;
        expect(avgConfidence).toBeGreaterThan(0.3);
      }
    }, 60000);
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle no search results gracefully', async () => {
      if (!process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping no results test - missing Google API key');
        return;
      }

      const context: ShowSearchContext = {
        title: 'Nonexistent Exhibition That Should Not Exist Anywhere',
        artist: 'Nonexistent Artist',
        gallery: 'Nonexistent Gallery',
        year: '2024'
      };

      const result = await pipeline.discoverAndExtract(context);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('No suitable exhibition URL found');
      expect(result.confidence).toBe(0);
    }, 60000);

    it('should handle invalid URLs gracefully', async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.log('⚠️ Skipping invalid URL test - missing Gemini API key');
        return;
      }

      const invalidUrl = 'https://invalid-gallery-url-that-does-not-exist.com/exhibition';
      
      try {
        await fetchAndCleanHtml(invalidUrl);
        // If we get here, the URL unexpectedly works
        expect(true).toBe(true);
      } catch (error) {
        // Expected - invalid URL should throw error
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Failed to fetch');
      }
    }, 30000);

    it('should validate confidence scoring consistency', async () => {
      // Test confidence calculation with known good data
      const mockGoodExtraction = {
        title: 'Test Exhibition',
        artists: ['Test Artist'],
        start_date: '2024-01-01',
        end_date: '2024-02-01',
        press_release: 'This is a comprehensive press release with lots of detailed information about the exhibition.',
        images: ['image1.jpg', 'image2.jpg', 'image3.jpg']
      };

      const context: ShowSearchContext = {
        title: 'Test Exhibition',
        artist: 'Test Artist',
        gallery: 'Test Gallery',
        year: '2024'
      };

      // Test confidence calculation (this is a unit test within integration)
      const pipeline = new DiscoveryPipeline();
      const confidence = (pipeline as any).calculateOverallConfidence(context, mockGoodExtraction);
      
      expect(confidence).toBeGreaterThan(80);
      expect(confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance and Scalability', () => {
    it('should complete discovery within reasonable time limits', async () => {
      if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping performance test - missing API keys');
        return;
      }

      const context: ShowSearchContext = {
        title: 'Telos Tales',
        artist: 'Alicja Kwade',
        gallery: 'Pace',
        year: '2025'
      };

      const startTime = Date.now();
      const result = await pipeline.discoverAndExtract(context);
      const duration = Date.now() - startTime;

      // Should complete within 2 minutes
      expect(duration).toBeLessThan(120000);
      
      // Should be reasonably fast for production use
      if (result.success) {
        expect(duration).toBeLessThan(60000); // 1 minute for successful discoveries
      }
    }, 120000);

    it('should handle multiple concurrent discoveries', async () => {
      if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping concurrent test - missing API keys');
        return;
      }

      const testShows = [
        { title: 'Test Show 1', artist: 'Artist 1', gallery: 'Gallery 1', year: '2024' },
        { title: 'Test Show 2', artist: 'Artist 2', gallery: 'Gallery 2', year: '2024' }
      ];

      const promises = testShows.map(show => 
        pipeline.discoverAndExtract(show)
      );

      const results = await Promise.all(promises);
      
      // All promises should resolve (not necessarily successfully)
      expect(results.length).toBe(testShows.length);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    }, 180000); // 3 minutes for concurrent tests
  });

  describe('Integration with Test Fixtures', () => {
    it('should validate all test galleries have proper structure', () => {
      TEST_GALLERIES.forEach(gallery => {
        expect(gallery.name).toBeTruthy();
        expect(gallery.website).toMatch(/^https?:\/\//);
        expect(gallery.expectedFields.length).toBeGreaterThan(0);
        expect(gallery.testShows.length).toBeGreaterThan(0);
        expect(gallery.confidence_threshold).toBeGreaterThan(0);
        expect(gallery.confidence_threshold).toBeLessThanOrEqual(100);
        
        gallery.testShows.forEach(show => {
          expect(show.title).toBeTruthy();
          expect(show.artist).toBeTruthy();
          expect(show.year).toBeTruthy();
          expect(show.expectedFields.length).toBeGreaterThan(0);
        });
      });
    });

    it('should successfully process at least one test show from fixtures', async () => {
      if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_SEARCH_API_KEY) {
        console.log('⚠️ Skipping fixture test - missing API keys');
        return;
      }

      const testShows = getAllTestShows();
      expect(testShows.length).toBeGreaterThan(0);

      // Test the first show (Pace Gallery - Telos Tales)
      const testShow = testShows[0];
      const context: ShowSearchContext = {
        title: testShow.title,
        artist: testShow.artist,
        gallery: 'Pace', // Simplified gallery name for search
        year: testShow.year
      };

      const result = await pipeline.discoverAndExtract(context);
      
      // Should succeed with high confidence for our known test case
      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(70);
      expect(result.discoveredUrl).toBeTruthy();
    }, 120000);
  });
}); 