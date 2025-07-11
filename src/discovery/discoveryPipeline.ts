import { WebSearchService } from '../services/webSearchService';
import { UrlFilterService } from '../services/urlFilterService';
import { LinkSelectionService } from '../services/linkSelectionService';
import { SearchQueryBuilder, ShowSearchContext } from './searchQueryBuilder';
import { extractShowFields, agenticUrlDiscovery } from '../extractors/extractFieldsGemini';
import { fetchAndCleanHtml } from '../utils/fetchHtml';

export interface DiscoveryResult {
  success: boolean;
  discoveredUrl?: string;
  extractedData?: any;
  searchQueries: string[];
  urlsFound: number;
  urlsFiltered: number;
  errors: string[];
  confidence: number;
}

export class DiscoveryPipeline {
  private webSearch: WebSearchService;
  private urlFilter: UrlFilterService;
  private linkSelector: LinkSelectionService;
  private queryBuilder: SearchQueryBuilder;

  constructor() {
    this.webSearch = new WebSearchService();
    this.urlFilter = new UrlFilterService();
    this.linkSelector = new LinkSelectionService();
    this.queryBuilder = new SearchQueryBuilder();
  }

  async discoverAndExtract(context: ShowSearchContext): Promise<DiscoveryResult> {
    const result: DiscoveryResult = {
      success: false,
      searchQueries: [],
      urlsFound: 0,
      urlsFiltered: 0,
      errors: [],
      confidence: 0
    };

    try {
      console.log(`🚀 Starting agentic discovery pipeline for: "${context.title}" by ${context.artist}`);
      
      // STEP 1: Try agentic URL discovery first (new multi-step approach)
      console.log(`🤖 Attempting agentic URL discovery...`);
      let bestUrl = await agenticUrlDiscovery(
        context.title, 
        [context.artist], 
        context.gallery_website || undefined
      );
      
      // STEP 2: If agentic discovery found a URL, validate and extract
      if (bestUrl) {
        console.log(`✅ Agentic discovery found URL: ${bestUrl}`);
        result.discoveredUrl = bestUrl;
        
        // Extract show data using Phase 2 pipeline
        console.log(`📄 Extracting show data from agentic discovery...`);
        const html = await fetchAndCleanHtml(bestUrl);
        const extractedData = await extractShowFields(html, bestUrl);
        
        result.extractedData = {
          ...extractedData,
          extracted_at: new Date().toISOString(),
          has_been_enriched: true,
          source_url: bestUrl
        };
        
        result.success = true;
        result.confidence = this.calculateOverallConfidence(context, extractedData);
        
        console.log(`✅ Agentic discovery completed with ${result.confidence}% confidence`);
        return result;
      }
      
      // STEP 3: Fallback to existing Google search approach
      console.log(`⚠️ Agentic discovery failed, falling back to Google search...`);
      
      // Generate search queries with fallback strategies
      const queries = this.queryBuilder.buildSearchQueries(context);
      result.searchQueries = queries;
      
      // Try each query until we find a good result
      for (const query of queries) {
        console.log(`🔍 Searching: ${query}`);
        
        const searchResults = await this.webSearch.searchExhibitions(query);
        result.urlsFound += searchResults.length;
        
        if (searchResults.length === 0) {
          console.log(`❌ No results for query: ${query}`);
          continue;
        }
        
        // Special handling for arthap.com URLs - extract gallery website
        const processedResults = await this.processSearchResults(searchResults, context);
        
        // Filter for gallery URLs with expected gallery website prioritization
        const expectedWebsite = context.gallery_website || undefined;
        const filteredUrls = this.urlFilter.filterGalleryUrls(processedResults, expectedWebsite);
        result.urlsFiltered += filteredUrls.length;
        
        if (filteredUrls.length === 0) {
          console.log(`❌ No gallery URLs found for query: ${query}`);
          continue;
        }
        
        // Check if we have perfect confidence - skip Gemini if so
        const topConfidence = filteredUrls[0]?.confidence || 0;
        console.log(`📊 Top URL confidence: ${(topConfidence * 100).toFixed(0)}%`);
        
        if (topConfidence >= 1.0) {
          // Perfect confidence - use top URL directly
          bestUrl = filteredUrls[0].url;
          console.log(`🎯 Perfect confidence! Using top URL directly: ${bestUrl}`);
        } else {
          // Let Gemini select the best URL from candidates
          bestUrl = await this.linkSelector.selectExhibitionUrl(filteredUrls, context);
        }
        result.discoveredUrl = bestUrl;
        
        if (topConfidence > 0.7) {
          console.log(`✅ High confidence result found, stopping search`);
          break;
        } else {
          console.log(`⚠️ Low confidence, trying next query...`);
        }
      }

      if (!bestUrl) {
        result.errors.push('No suitable exhibition URL found after trying all search strategies');
        return result;
      }

      console.log(`🎯 Selected exhibition URL: ${bestUrl}`);
      
      // Extract show data using Phase 2 pipeline
      console.log(`📄 Extracting show data...`);
      const html = await fetchAndCleanHtml(bestUrl);
      const extractedData = await extractShowFields(html, bestUrl);
      
      result.extractedData = {
        ...extractedData,
        extracted_at: new Date().toISOString(),
        has_been_enriched: true,
        source_url: bestUrl
      };
      
      result.success = true;
      result.confidence = this.calculateOverallConfidence(context, extractedData);
      
      console.log(`✅ Discovery completed with ${result.confidence}% confidence`);
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`💥 Discovery pipeline failed: ${errorMessage}`);
      
      // Check if this was a rate limit error vs a genuine failure
      if (errorMessage.includes('RATE_LIMIT:') || errorMessage.includes('Too Many Requests') || errorMessage.includes('quota')) {
        result.errors.push(`API rate limit exceeded - temporary failure: ${errorMessage}`);
      } else if (errorMessage.includes('No suitable exhibition URL found')) {
        result.errors.push('No suitable exhibition URL found');
      } else {
        result.errors.push(`Discovery failed: ${errorMessage}`);
      }
      
      return result;
    }
  }

  /**
   * Process search results with special handling for arthap.com and other special cases
   */
  private async processSearchResults(searchResults: any[], context: ShowSearchContext): Promise<any[]> {
    const processedResults = [];
    
    for (const result of searchResults) {
             // Special handling for arthap.com URLs
       if (result.link && result.link.includes('arthap.com')) {
         console.log(`🔗 Found arthap.com URL, attempting to extract gallery links: ${result.link}`);
         
         try {
           // Import the function locally to avoid circular dependency
           const { extractArthapLinks } = await import('../extractors/extractFieldsGemini');
           const extractedLinks = await extractArthapLinks(result.link);
           
           // If we found a gallery website, update context for better filtering
           if (extractedLinks.galleryWebsite && !context.gallery_website) {
             console.log(`🔗 Extracted gallery website from arthap: ${extractedLinks.galleryWebsite}`);
             context.gallery_website = extractedLinks.galleryWebsite;
           }
           
           // If we found a direct event URL, add it as a high-priority result
           if (extractedLinks.eventUrl) {
             console.log(`🎯 Found direct event URL from arthap: ${extractedLinks.eventUrl}`);
             processedResults.push({
               ...result,
               link: extractedLinks.eventUrl,
               title: `${result.title} (Direct Event Link)`,
               confidence: 0.95 // High confidence for direct links
             });
           }
          
          // Keep the original arthap URL as fallback
          processedResults.push(result);
          
        } catch (error) {
          console.warn(`⚠️ Failed to process arthap.com URL: ${error instanceof Error ? error.message : String(error)}`);
          processedResults.push(result);
        }
      } else {
        processedResults.push(result);
      }
    }
    
    return processedResults;
  }

  private calculateOverallConfidence(context: ShowSearchContext, extracted: any): number {
    let score = 0;
    let maxScore = 0;
    
    // Title match (30 points)
    maxScore += 30;
    if (extracted.title && this.fuzzyMatch(context.title, extracted.title)) {
      score += 30;
      console.log(`✅ Title match: "${context.title}" ≈ "${extracted.title}"`);
    } else if (extracted.title) {
      console.log(`⚠️ Title mismatch: "${context.title}" vs "${extracted.title}"`);
    }
    
    // Artist match (30 points)
    maxScore += 30;
    if (extracted.artists && extracted.artists.some((artist: string) => 
      this.fuzzyMatch(context.artist, artist))) {
      score += 30;
      console.log(`✅ Artist match found in: ${extracted.artists.join(', ')}`);
    } else if (extracted.artists) {
      console.log(`⚠️ Artist mismatch: "${context.artist}" not in ${extracted.artists.join(', ')}`);
    }
    
    // Data completeness (40 points)
    maxScore += 40;
    if (extracted.start_date) {
      score += 10;
      console.log(`✅ Start date found: ${extracted.start_date}`);
    }
    if (extracted.end_date) {
      score += 10;
      console.log(`✅ End date found: ${extracted.end_date}`);
    }
    if (extracted.press_release && extracted.press_release.length > 100) {
      score += 10;
      console.log(`✅ Press release found (${extracted.press_release.length} chars)`);
    }
    // Check for images (primary + additional)
    const totalImages = (extracted.image_url ? 1 : 0) + 
                       (extracted.additional_images ? extracted.additional_images.length : 0);
    if (totalImages > 0) {
      score += 10;
      console.log(`✅ Images found: ${totalImages}`);
    }
    
    return Math.round((score / maxScore) * 100);
  }

  private fuzzyMatch(str1: string, str2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n1 = normalize(str1);
    const n2 = normalize(str2);
    
    // Exact match
    if (n1 === n2) return true;
    
    // Contains match
    if (n1.includes(n2) || n2.includes(n1)) return true;
    
    // Word overlap
    const words1 = n1.split(/\s+/).filter(w => w.length > 2);
    const words2 = n2.split(/\s+/).filter(w => w.length > 2);
    const overlap = words1.filter(w => words2.includes(w)).length;
    
    return overlap >= Math.min(words1.length, words2.length) * 0.5;
  }
} 