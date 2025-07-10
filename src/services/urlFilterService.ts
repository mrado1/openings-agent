import { SearchResult } from './webSearchService';

export interface FilteredUrl {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  confidence: number;
}

export class UrlFilterService {
  filterGalleryUrls(searchResults: SearchResult[]): FilteredUrl[] {
    console.log(`🔍 Filtering ${searchResults.length} search results for gallery URLs...`);
    
    const filtered = searchResults
      .map(result => this.analyzeUrl(result))
      .filter(result => result.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
    
    console.log(`✅ Filtered to ${filtered.length} potential gallery URLs`);
    
    return filtered;
  }

  private analyzeUrl(result: SearchResult): FilteredUrl {
    const url = new URL(result.link);
    const domain = url.hostname.toLowerCase();
    
    let confidence = 0.5; // Base confidence
    
    // Gallery domain indicators
    if (this.isGalleryDomain(domain)) confidence += 0.3;
    if (this.hasExhibitionPath(url.pathname)) confidence += 0.2;
    
    // Content indicators
    if (this.hasExhibitionKeywords(result.title + ' ' + result.snippet)) confidence += 0.2;
    
    // Penalize non-gallery sites
    if (this.isSocialMedia(domain)) confidence -= 0.5;
    if (this.isNewsArticle(result.title, result.snippet)) confidence -= 0.3;
    if (this.isAggregatorSite(domain)) confidence -= 0.3;
    
    // Boost known gallery domains
    if (this.isKnownGallery(domain)) confidence += 0.4;
    
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

  private isKnownGallery(domain: string): boolean {
    const knownGalleries = [
      'gagosian.com', 'pacegallery.com', 'davidzwirner.com',
      'mariangoodman.com', 'hauserwirth.com', 'perrotin.com',
      'lehmannmaupin.com', 'matthewmarks.com', 'petzel.com'
    ];
    return knownGalleries.some(gallery => domain.includes(gallery));
  }
} 