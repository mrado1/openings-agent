import axios from 'axios';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

interface SearchResponse {
  items?: SearchResult[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
}

export class WebSearchService {
  private apiKey: string;
  private searchEngineId: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_SEARCH_API_KEY!;
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;
    
    if (!this.apiKey || !this.searchEngineId) {
      throw new Error('Google Search API key and Search Engine ID are required');
    }
  }

  async searchExhibitions(query: string, options: { maxResults?: number } = {}): Promise<SearchResult[]> {
    const { maxResults = 10 } = options;
    
    try {
      console.log(`🔍 Google Search: "${query}"`);
      
      const response = await axios.get<SearchResponse>('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: this.apiKey,
          cx: this.searchEngineId,
          q: query,
          num: Math.min(maxResults, 10), // Google API limit
          safe: 'off' // Disable SafeSearch for broader results
        },
        timeout: 10000
      });

      const results = response.data.items || [];
      console.log(`📊 Found ${results.length} search results`);
      
      return results;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error('Google Search API rate limit exceeded. Please try again later.');
        }
        if (error.response?.status === 403) {
          throw new Error('Google Search API access forbidden. Check your API key and billing.');
        }
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Google Search failed: ${errorMessage}`);
    }
  }
}

export { SearchResult }; 