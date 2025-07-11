import { SearchResult } from './webSearchService';

export interface FilteredUrl {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  confidence: number;
}

export class UrlFilterService {
  filterGalleryUrls(searchResults: SearchResult[], expectedGalleryWebsite?: string): FilteredUrl[] {
    console.log(`🔍 Filtering ${searchResults.length} search results for gallery URLs...`);
    if (expectedGalleryWebsite) {
      console.log(`🎯 Prioritizing URLs from expected gallery domain: ${expectedGalleryWebsite}`);
    }
    
    const filtered = searchResults
      .map(result => this.analyzeUrl(result, expectedGalleryWebsite))
      .filter(result => result.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
    
    console.log(`✅ Filtered to ${filtered.length} potential gallery URLs`);
    
    return filtered;
  }

  private analyzeUrl(result: SearchResult, expectedGalleryWebsite?: string): FilteredUrl {
    const url = new URL(result.link);
    const domain = url.hostname.toLowerCase();
    
    let confidence = 0.5; // Base confidence
    
    // MAJOR BOOST: Prioritize expected gallery domain
    if (expectedGalleryWebsite) {
      const expectedDomain = new URL(`https://${expectedGalleryWebsite.replace(/^https?:\/\//, '')}`).hostname.toLowerCase();
      if (domain.includes(expectedDomain.replace('www.', '')) || expectedDomain.includes(domain.replace('www.', ''))) {
        confidence += 0.4; // Major boost for matching gallery domain
        console.log(`🎯 Found expected gallery domain: ${domain} matches ${expectedDomain}`);
      }
    }
    
    // Gallery domain indicators
    if (this.isGalleryDomain(domain)) confidence += 0.3;
    if (this.hasExhibitionPath(url.pathname)) confidence += 0.2;
    
    // Content indicators
    if (this.hasExhibitionKeywords(result.title + ' ' + result.snippet)) confidence += 0.2;
    
    // Penalize non-gallery sites
    if (this.isSocialMedia(domain)) confidence -= 0.5;
    if (this.isNewsArticle(result.title, result.snippet)) confidence -= 0.3;
    if (this.isAggregatorSite(domain)) confidence -= 0.3;
    
    return {
      url: result.link,
      title: result.title,
      snippet: result.snippet,
      domain,
      confidence: Math.max(0, Math.min(1, confidence))
    };
  }

  private isGalleryDomain(domain: string): boolean {
    const galleryIndicators = [
      'gallery', 'galerie', 'kunst', 'art', 'museum',
      '.art', 'exhibitions', 'contemporary', 'artspace'
    ];
    return galleryIndicators.some(indicator => domain.includes(indicator));
  }

  private hasExhibitionPath(pathname: string): boolean {
    const exhibitionPaths = [
      '/exhibition', '/show', '/current', '/upcoming',
      '/events', '/gallery', '/artist', '/works'
    ];
    return exhibitionPaths.some(path => pathname.toLowerCase().includes(path));
  }

  private hasExhibitionKeywords(text: string): boolean {
    const keywords = [
      'exhibition', 'show', 'opening', 'gallery', 'artist',
      'paintings', 'sculptures', 'works', 'art', 'contemporary',
      'solo show', 'group show', 'installation', 'on view'
    ];
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
  }

  private isSocialMedia(domain: string): boolean {
    const socialDomains = [
      'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
      'linkedin.com', 'pinterest.com', 'tiktok.com', 'youtube.com'
    ];
    return socialDomains.some(social => domain.includes(social));
  }

  private isNewsArticle(title: string, snippet: string): boolean {
    const newsIndicators = [
      'news', 'article', 'review', 'critic', 'interview',
      'magazine', 'newspaper', 'blog post', 'press release'
    ];
    const text = (title + ' ' + snippet).toLowerCase();
    return newsIndicators.some(indicator => text.includes(indicator));
  }

  private isAggregatorSite(domain: string): boolean {
    const aggregators = [
      'artforum.com', 'artnet.com', 'e-flux.com', 'artsy.net',
      'hyperallergic.com', 'frieze.com', 'artreview.com'
    ];
    return aggregators.some(agg => domain.includes(agg));
  }
} 