import { GoogleGenerativeAI } from '@google/generative-ai';
import { ShowData } from '../types/schemas';
import { generateShowSummary } from '../services/summaryGenerationService';
import { fetchAndCleanHtml } from '../utils/fetchHtml';

// Phase 2: Enhanced Metadata Enums
export enum ArtistMedium {
  PAINTING = "painting",
  SCULPTURE = "sculpture",
  PHOTOGRAPHY = "photography",
  DRAWING = "drawing",
  PRINTS = "prints",
  CERAMICS = "ceramics",
  MIXED_MEDIA = "mixed_media",
  INSTALLATION = "installation",
  VIDEO = "video",
  PERFORMANCE = "performance",
  TEXTILE = "textile"
}

export enum ArtistCareerStage {
  EMERGING = "emerging",
  EARLY_CAREER = "early_career",
  MID_CAREER = "mid_career",
  ESTABLISHED = "established",
  BLUE_CHIP = "blue_chip"
}





// Phase 2: Enhanced metadata extraction functions
async function extractArtistMedium(pressRelease: string, title: string, artistName: string): Promise<ArtistMedium | null> {
  if (!pressRelease || pressRelease.length < 50) {
    return null; // Not enough content to analyze
  }
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Analyze this art exhibition information and classify the artist's primary medium.

ARTIST: ${artistName}
EXHIBITION TITLE: ${title}
PRESS RELEASE: ${pressRelease}

Based on the description, classify this artist's primary medium from these options:
- painting (oil, acrylic, watercolor paintings)
- sculpture (3D objects, installations requiring physical space)
- photography (digital, film, mixed media photos)
- drawing (pencil, charcoal, ink, works on paper)
- prints (lithographs, etchings, screen prints)
- ceramics (clay, pottery, fired ceramic objects)
- mixed_media (collage, assemblage, multiple techniques)
- installation (site-specific, immersive environments)
- video (moving image, digital media)
- performance (live art, time-based works)
- textile (fabric, fiber art, wearable art)

Return ONLY the medium keyword, or "unknown" if unclear.`;

    const result = await model.generateContent(prompt);
    const medium = result.response.text().trim().toLowerCase();
    
    // Validate against enum values
    const validMediums = Object.values(ArtistMedium);
    if (validMediums.includes(medium as ArtistMedium)) {
      console.log(`🎨 Detected artist medium: ${medium} for ${artistName}`);
      return medium as ArtistMedium;
    }
    
    console.log(`⚠️ Could not determine medium for ${artistName} (got: ${medium})`);
    return null;
    
  } catch (error) {
    console.warn(`⚠️ Artist medium extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}



interface EnhancedMetadata {
  artistMedium: ArtistMedium | null;
}

async function extractEnhancedMetadata(
  pressRelease: string,
  title: string,
  primaryArtist: string
): Promise<EnhancedMetadata> {
  
  console.log(`🚀 Phase 2: Extracting enhanced metadata for "${title}" by ${primaryArtist}`);
  
  // Extract artist medium
  const artistMedium = await extractArtistMedium(pressRelease, title, primaryArtist);
  
  return { 
    artistMedium
  };
}

/**
 * Clean any existing Artforum URLs from show data
 */
function cleanExistingArtforumImages(existingImageUrl?: string): string {
  if (!existingImageUrl || existingImageUrl.includes('artforum.com')) {
    console.log(`🧹 Cleaned existing Artforum image URL: ${existingImageUrl || 'none'}`);
    return '';
  }
  return existingImageUrl;
}

/**
 * Normalize image URL parameters for consistent sizing
 */
function normalizeImageUrl(imageUrl: string, isPrimary: boolean = false): string {
  try {
    const url = new URL(imageUrl);
    
    // Standard sizes for mobile optimization
    const primarySize = '1200'; // Primary image: good quality for iPhone display
    const additionalSize = '800'; // Additional images: smaller for gallery performance
    const targetSize = isPrimary ? primarySize : additionalSize;
    
    // Common image size parameters to normalize
    const sizeParams = ['w', 'width', 'h', 'height', 'size', 's'];
    
    // Check if URL has any size parameters
    let hasSizeParam = false;
    sizeParams.forEach(param => {
      if (url.searchParams.has(param)) {
        hasSizeParam = true;
        url.searchParams.set(param, targetSize);
      }
    });
    
    // If no existing size param but URL supports it (common CDN patterns)
    if (!hasSizeParam) {
      // Sanity CDN, Cloudinary, and other common CDNs use 'w' parameter
      if (url.hostname.includes('sanity.io') || 
          url.hostname.includes('cloudinary.com') ||
          url.hostname.includes('cdn.') ||
          url.pathname.includes('resize') ||
          url.pathname.includes('transform')) {
        url.searchParams.set('w', targetSize);
      }
    }
    
    const normalizedUrl = url.toString();
    if (normalizedUrl !== imageUrl) {
      console.log(`🔧 Normalized image size: ${imageUrl.split('?')[0]}?... → ?w=${targetSize}`);
    }
    
    return normalizedUrl;
    
  } catch (error) {
    console.warn(`⚠️ Could not normalize image URL: ${imageUrl}`);
    return imageUrl; // Return original if normalization fails
  }
}

/**
 * Process and validate extracted images according to mobile-first strategy
 */
function processExtractedImages(
  primaryImage: string, 
  additionalImages: string[], 
  galleryUrl: string,
  existingImageUrl?: string
): { image_url: string; additional_images: string[] } {
  const galleryDomain = new URL(galleryUrl).hostname;
  
  // Clean any existing Artforum image and include in processing
  const cleanedExistingImage = cleanExistingArtforumImages(existingImageUrl);
  
  // Combine all images for processing (prioritize new extractions over existing)
  const allImages = [primaryImage, ...additionalImages, cleanedExistingImage].filter(Boolean);
  
  // Filter out Artforum URLs and invalid images, converting relative URLs to absolute
  const validImages = allImages.map(imageUrl => {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    
    try {
      // Handle relative URLs by converting to absolute
      let fullImageUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        const galleryOrigin = new URL(galleryUrl).origin;
        fullImageUrl = galleryOrigin + imageUrl;
      } else if (imageUrl.startsWith('./') || (!imageUrl.includes('://') && !imageUrl.startsWith('http'))) {
        // Handle relative paths like ./images/... or images/...
        const galleryBase = galleryUrl.endsWith('/') ? galleryUrl : galleryUrl + '/';
        fullImageUrl = new URL(imageUrl.replace('./', ''), galleryBase).href;
      }
      
      const url = new URL(fullImageUrl);
      
      // Never accept Artforum URLs
      if (url.hostname.includes('artforum.com')) {
        console.log(`🚫 Rejected Artforum image: ${imageUrl}`);
        return null;
      }
      
      // Accept images from gallery domain or valid CDN
      const isGalleryDomain = url.hostname.includes(galleryDomain.replace('www.', ''));
      
      // Accept images with valid extensions
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      const hasValidExtension = validExtensions.some(ext => 
        fullImageUrl.toLowerCase().includes(ext)
      );
      
      // Avoid social media, logos, and navigation elements
      const isInvalidImage = [
        'logo', 'icon', 'favicon', 'nav', 'menu', 'footer', 'header',
        'facebook', 'instagram', 'twitter', 'social', 'share'
      ].some(term => fullImageUrl.toLowerCase().includes(term));
      
      if (hasValidExtension && !isInvalidImage) {
        return fullImageUrl;
      }
      
      return null;
      
    } catch (error) {
      console.log(`🚫 Invalid image URL: ${imageUrl}`);
      return null;
    }
  }).filter((url): url is string => url !== null);
  
  if (validImages.length === 0) {
    console.log(`⚠️ No valid gallery images found, returning empty image fields`);
    console.log(`🚫 Rejected ${allImages.length} images (likely Artforum URLs or invalid formats)`);
    return { image_url: '', additional_images: [] };
  }
  
  // Score images separately for primary (portrait preferred) vs additional (landscape preferred)
  const scoredImages = validImages.map(imageUrl => {
    let portraitScore = 0; // Score for primary image (prefer portrait)
    let landscapeScore = 0; // Score for additional images (prefer landscape)
    const url = new URL(imageUrl);
    
    // Base scoring for both (prefer images from same gallery domain)
    const baseScore = url.hostname.includes(galleryDomain.replace('www.', '')) ? 10 : 0;
    portraitScore += baseScore;
    landscapeScore += baseScore;
    
    // Prefer high-resolution indicators
    if (imageUrl.match(/\d{3,4}x\d{3,4}/)) { // Has resolution in URL like 1200x800
      const match = imageUrl.match(/(\d{3,4})x(\d{3,4})/);
      if (match) {
        const width = parseInt(match[1]);
        const height = parseInt(match[2]);
        const aspectRatio = width / height;
        
        // PRIMARY IMAGE SCORING: Prefer portrait images for iPhone
        if (aspectRatio >= 0.5 && aspectRatio <= 0.8) {
          portraitScore += 12; // Strong preference for good portrait ratios (9:16 to 4:5)
        } else if (aspectRatio > 0.8 && aspectRatio < 1.0) {
          portraitScore += 8; // Moderate preference for slightly wider portraits
        } else if (aspectRatio >= 1.0 && aspectRatio <= 1.3) {
          portraitScore += 4; // Slight preference for square-ish images (fallback)
        }
        // Landscape images (aspectRatio > 1.3) get no bonus for primary
        
        // ADDITIONAL IMAGES SCORING: Prefer landscape images for gallery viewing
        if (aspectRatio >= 1.3 && aspectRatio <= 2.0) {
          landscapeScore += 12; // Strong preference for good landscape ratios (4:3 to 16:9)
        } else if (aspectRatio > 1.0 && aspectRatio < 1.3) {
          landscapeScore += 8; // Moderate preference for slightly wider than square
        } else if (aspectRatio >= 0.8 && aspectRatio <= 1.0) {
          landscapeScore += 4; // Slight preference for square-ish images (fallback)
        }
        // Portrait images (aspectRatio < 0.8) get no bonus for additional
        
        // Common scoring: Prefer larger images
        const sizeBonus = (width >= 1200) ? 3 : (width >= 800) ? 5 : 0;
        portraitScore += sizeBonus;
        landscapeScore += sizeBonus;
        
        // Log aspect ratio analysis for debugging
        console.log(`📱 Image aspect analysis: ${width}x${height} = ${aspectRatio.toFixed(2)} (${aspectRatio < 1.0 ? 'portrait' : 'landscape'}) - Portrait score: ${portraitScore}, Landscape score: ${landscapeScore}`);
      }
    }
    
    // Common scoring: Prefer certain file formats
    const formatBonus = imageUrl.includes('.webp') ? 3 : 
                       (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')) ? 2 : 
                       imageUrl.includes('.png') ? 1 : 0;
    portraitScore += formatBonus;
    landscapeScore += formatBonus;
    
    // Common scoring: Prefer exhibition/artwork related paths
    const exhibitionTerms = ['exhibition', 'show', 'artwork', 'installation', 'gallery', 'view'];
    const exhibitionBonus = exhibitionTerms.some(term => imageUrl.toLowerCase().includes(term)) ? 5 : 0;
    portraitScore += exhibitionBonus;
    landscapeScore += exhibitionBonus;
    
    return { 
      url: imageUrl, 
      portraitScore, 
      landscapeScore,
      aspectRatio: imageUrl.match(/(\d{3,4})x(\d{3,4})/) ? 
        parseInt(imageUrl.match(/(\d{3,4})x(\d{3,4})/)![1]) / parseInt(imageUrl.match(/(\d{3,4})x(\d{3,4})/)![2]) : 1.0
    };
  });
  
  // Sort by portrait score for primary image selection
  const portraitSorted = [...scoredImages].sort((a, b) => b.portraitScore - a.portraitScore);
  
  // Sort by landscape score for additional images selection  
  const landscapeSorted = [...scoredImages].sort((a, b) => b.landscapeScore - a.landscapeScore);
  
  console.log(`🖼️ Processed ${validImages.length} valid images`);
  console.log(`📱 Best portrait image score: ${portraitSorted[0]?.portraitScore || 0} (aspect: ${portraitSorted[0]?.aspectRatio?.toFixed(2) || 'unknown'})`);
  console.log(`🖥️ Best landscape image score: ${landscapeSorted[0]?.landscapeScore || 0} (aspect: ${landscapeSorted[0]?.aspectRatio?.toFixed(2) || 'unknown'})`);
  
  // Select primary image (best portrait score) and normalize for mobile
  const rawPrimaryImageUrl = portraitSorted[0].url;
  const primaryImageUrl = normalizeImageUrl(rawPrimaryImageUrl, true);
  
  // Select additional images (best landscape scores, excluding the primary) and normalize
  const rawAdditionalImageUrls = landscapeSorted
    .filter(img => img.url !== rawPrimaryImageUrl) // Don't duplicate primary image
    .slice(0, 5) // Limit to 5 additional for mobile performance
    .map(img => img.url);
  
  const additionalImageUrls = rawAdditionalImageUrls.map(url => normalizeImageUrl(url, false));
  
  console.log(`✅ Selected primary image (portrait): ${primaryImageUrl}`);
  console.log(`✅ Selected ${additionalImageUrls.length} additional images (landscape preference)`);
  
  return {
    image_url: primaryImageUrl,
    additional_images: additionalImageUrls
  };
}

/**
 * Search directly on gallery website for specific show page
 */
async function searchGalleryWebsiteForShow(
  galleryWebsite: string, 
  showTitle: string, 
  artistNames: string[]
): Promise<string | null> {
  try {
    console.log(`🔍 Primary search: Looking for "${showTitle}" on ${galleryWebsite}...`);
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Fetch the gallery homepage first
    const galleryBaseUrl = galleryWebsite.startsWith('http') ? galleryWebsite : `https://${galleryWebsite}`;
    const html = await fetchAndCleanHtml(galleryBaseUrl);
    
    const searchPrompt = `You are searching a gallery website for a specific art exhibition page.

GALLERY WEBSITE: ${galleryWebsite}
EXHIBITION: "${showTitle}" by ${artistNames.join(', ')}

TASK: Find the URL for this specific exhibition on this gallery's website.

Look through this HTML for:
1. Navigation menus with "exhibitions", "shows", "current", "upcoming"
2. Direct links to exhibitions matching the title "${showTitle}"
3. Artist pages that might link to the exhibition
4. Exhibition archive or listing pages

Return ONLY the most relevant URL path or full URL for this specific exhibition.
If multiple URLs seem relevant, return the most specific exhibition page.
If no relevant exhibition URL is found, return "NOT_FOUND".

HTML CONTENT:
${html.substring(0, 50000)} // Limit to avoid token limits

URL:`;

    const result = await model.generateContent(searchPrompt);
    const suggestedUrl = result.response.text().trim();
    
    if (suggestedUrl === 'NOT_FOUND' || !suggestedUrl || suggestedUrl.length < 5) {
      console.log(`❌ No exhibition URL found on ${galleryWebsite}`);
      return null;
    }
    
    // Convert relative URLs to absolute
    let fullUrl = suggestedUrl;
    if (suggestedUrl.startsWith('/')) {
      const base = new URL(galleryBaseUrl);
      fullUrl = `${base.origin}${suggestedUrl}`;
    } else if (!suggestedUrl.startsWith('http')) {
      fullUrl = `${galleryBaseUrl.replace(/\/$/, '')}/${suggestedUrl}`;
    }
    
    console.log(`✅ Found exhibition URL on gallery website: ${fullUrl}`);
    return fullUrl;
    
  } catch (error) {
    console.warn(`⚠️ Gallery website search failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Extract gallery website and event links from arthap.com pages
 */
async function extractArthapLinks(arthapUrl: string): Promise<{ galleryWebsite?: string; eventUrl?: string }> {
  try {
    console.log(`🔗 Extracting links from arthap.com page: ${arthapUrl}`);
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const html = await fetchAndCleanHtml(arthapUrl);
    
    const extractPrompt = `Extract gallery website and event links from this arthap.com page.

TASK: Find these specific links:
1. Gallery website URL (official gallery domain, not arthap.com)
2. Event/exhibition URL (direct link to the show page on gallery website)

Look for:
- Links to the gallery's official website
- Direct links to the exhibition page
- Contact information with gallery website
- "Visit Gallery" or "Gallery Website" links

Return JSON format:
{
  "galleryWebsite": "gallery-domain.com or full URL",
  "eventUrl": "direct exhibition URL if found"
}

Return empty strings for fields not found. Do not include arthap.com URLs.

HTML CONTENT:
${html.substring(0, 30000)}

JSON:`;

    const result = await model.generateContent(extractPrompt);
    const jsonStr = result.response.text().replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(jsonStr);
    
    console.log(`🔗 Extracted from arthap.com: gallery=${extracted.galleryWebsite || 'none'}, event=${extracted.eventUrl || 'none'}`);
    return extracted;
    
  } catch (error) {
    console.warn(`⚠️ Failed to extract links from arthap.com: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

/**
 * Validate if a URL has good content for enrichment
 */
async function validateUrlContent(url: string, showTitle: string): Promise<{ hasGoodContent: boolean; contentSummary: string }> {
  try {
    console.log(`🔍 Validating content quality of: ${url}`);
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const html = await fetchAndCleanHtml(url);
    
    const validationPrompt = `Evaluate if this webpage has good content for art exhibition enrichment.

EXHIBITION: "${showTitle}"
URL: ${url}

EVALUATION CRITERIA:
1. Has exhibition description, press release, or artist statement?
2. Contains high-quality artwork images?
3. Has exhibition details (dates, artists, etc.)?
4. Is this actually about the exhibition (not just gallery homepage)?

Return JSON:
{
  "hasGoodContent": true/false,
  "contentSummary": "brief description of what content is available"
}

Consider content GOOD if it has press release OR good images OR detailed exhibition info.
Consider content POOR if it's just a basic listing, contact page, or unrelated content.

HTML CONTENT:
${html.substring(0, 30000)}

JSON:`;

    const result = await model.generateContent(validationPrompt);
    const jsonStr = result.response.text().replace(/```json|```/g, '').trim();
    const validation = JSON.parse(jsonStr);
    
    console.log(`📋 Content validation: ${validation.hasGoodContent ? '✅ Good' : '❌ Poor'} - ${validation.contentSummary}`);
    return validation;
    
  } catch (error) {
    console.warn(`⚠️ Content validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return { hasGoodContent: false, contentSummary: 'Validation failed' };
  }
}

/**
 * Find alternative URLs on a page (like "Selected Works" or "Artworks" pages)
 */
async function findAlternativeUrls(url: string, showTitle: string): Promise<string[]> {
  try {
    console.log(`🔗 Looking for alternative URLs on: ${url}`);
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const html = await fetchAndCleanHtml(url);
    
    const alternativePrompt = `Find alternative relevant URLs on this exhibition page.

EXHIBITION: "${showTitle}"
CURRENT URL: ${url}

Look for links to:
1. "Selected Works", "Artworks", "Images", "Gallery", "Installation Views"
2. "Press Release", "Exhibition Details", "About the Show"
3. "Artist Works", "Exhibition Images", "View Works"
4. Any sub-pages that might have more content about this exhibition

Return JSON array of relevant URLs (up to 3 best alternatives):
[
  "url1",
  "url2", 
  "url3"
]

Only include URLs that are likely to have:
- Better exhibition images
- More detailed content
- Press release or artist statement
- Installation views or artwork details

Exclude: navigation, contact, social media, unrelated exhibitions.

HTML CONTENT:
${html.substring(0, 30000)}

JSON:`;

    const result = await model.generateContent(alternativePrompt);
    const jsonStr = result.response.text().replace(/```json|```/g, '').trim();
    const urls = JSON.parse(jsonStr);
    
    // Convert relative URLs to absolute
    const baseUrl = new URL(url);
    const absoluteUrls = urls.map((relUrl: string) => {
      if (relUrl.startsWith('/')) {
        return `${baseUrl.origin}${relUrl}`;
      } else if (!relUrl.startsWith('http')) {
        return `${url.replace(/\/$/, '')}/${relUrl}`;
      }
      return relUrl;
    }).filter((u: string) => u !== url); // Don't include the same URL
    
    console.log(`🔗 Found ${absoluteUrls.length} alternative URLs: ${absoluteUrls.slice(0, 2).join(', ')}${absoluteUrls.length > 2 ? '...' : ''}`);
    return absoluteUrls;
    
  } catch (error) {
    console.warn(`⚠️ Alternative URL search failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Agentic multi-step URL discovery and enrichment
 */
export async function agenticUrlDiscovery(
  showTitle: string,
  artistNames: string[],
  galleryWebsite?: string
): Promise<string | null> {
  console.log(`🤖 Starting agentic URL discovery for "${showTitle}" by ${artistNames.join(', ')}`);
  
  // Step 1: Try gallery website first if available
  if (galleryWebsite) {
    const galleryUrl = await searchGalleryWebsiteForShow(galleryWebsite, showTitle, artistNames);
    if (galleryUrl) {
      const validation = await validateUrlContent(galleryUrl, showTitle);
      if (validation.hasGoodContent) {
        console.log(`✅ Found good content on gallery website: ${galleryUrl}`);
        return galleryUrl;
      } else {
        console.log(`⚠️ Gallery URL has poor content, checking alternatives...`);
        const alternatives = await findAlternativeUrls(galleryUrl, showTitle);
        for (const altUrl of alternatives.slice(0, 2)) { // Check top 2 alternatives
          const altValidation = await validateUrlContent(altUrl, showTitle);
          if (altValidation.hasGoodContent) {
            console.log(`✅ Found good content on alternative URL: ${altUrl}`);
            return altUrl;
          }
        }
      }
    }
  }
  
  // Step 2: Fallback to Google search via existing web search service
  console.log(`🔍 Fallback: Using Google search for external discovery...`);
  
  try {
    const { WebSearchService } = await import('../services/webSearchService');
    const webSearch = new WebSearchService();
    
    const searchQuery = `"${showTitle}" ${artistNames.join(' ')} ${galleryWebsite || ''} art exhibition 2025`;
    console.log(`🔍 Google search query: ${searchQuery}`);
    
    const searchResults = await webSearch.searchExhibitions(searchQuery);
    
    if (searchResults.length === 0) {
      console.log(`❌ No search results found`);
      return null;
    }
    
         // Try to find the best URL from search results
     for (const result of searchResults.slice(0, 3)) { // Check top 3 results
       // Special handling for arthap.com
       if (result.link.includes('arthap.com')) {
         const arthapLinks = await extractArthapLinks(result.link);
         if (arthapLinks.eventUrl) {
           const validation = await validateUrlContent(arthapLinks.eventUrl, showTitle);
           if (validation.hasGoodContent) {
             console.log(`✅ Found good content via arthap.com: ${arthapLinks.eventUrl}`);
             return arthapLinks.eventUrl;
           }
         }
       } else {
         // Direct URL validation
         const validation = await validateUrlContent(result.link, showTitle);
         if (validation.hasGoodContent) {
           console.log(`✅ Found good content via search: ${result.link}`);
           return result.link;
         } else {
           // Try alternative URLs on this page
           const alternatives = await findAlternativeUrls(result.link, showTitle);
           for (const altUrl of alternatives.slice(0, 2)) {
             const altValidation = await validateUrlContent(altUrl, showTitle);
             if (altValidation.hasGoodContent) {
               console.log(`✅ Found good content on alternative URL: ${altUrl}`);
               return altUrl;
             }
           }
         }
       }
     }
    
    console.log(`⚠️ No good content found in search results`);
    return null;
    
  } catch (error) {
    console.warn(`⚠️ Google search fallback failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function extractShowFields(
  html: string, 
  galleryUrl: string
): Promise<Partial<ShowData & { artist_medium: ArtistMedium | null; show_url: string }>> {
  // Initialize genAI after environment is loaded
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const prompt = `You are an expert art gallery website parser. Extract exhibition information from this HTML with high precision.

CRITICAL INSTRUCTIONS:
1. DATES: Look for exhibition dates, opening/closing dates, duration. Common formats: "May 7 - August 15, 2025", "Through August 15", "On view until...", "May 7, 2025 - Aug 15, 2025"
2. PRESS RELEASE: Find the main exhibition description/statement, NOT gallery navigation or contact info. Look for artist statement, curatorial text, or exhibition overview.
3. IMAGES: Extract high-resolution artwork images from THIS GALLERY WEBSITE ONLY
   - NEVER use artforum.com images
   - For primary image: prefer PORTRAIT images (taller than wide) for iPhone main display
   - For additional images: prefer LANDSCAPE images (wider than tall) for gallery viewing
   - Prefer high-resolution images (.jpg, .png, .webp formats)
   - Look for exhibition installation views, artwork details, or artist photos
   - Avoid gallery logos, navigation elements, or social media icons
4. ARTISTS: Full names, handle multiple artists

Return ONLY valid JSON with these exact fields:
{
  "title": "exact exhibition title",
  "artists": ["Artist Full Name"],
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD", 
  "press_release": "main exhibition description or artist statement - NOT navigation text",
  "image_url": "primary_artwork_image_url",
  "additional_images": ["secondary_image_url1", "secondary_image_url2"]
}

IMPORTANT: 
- For dates: Convert any date format to YYYY-MM-DD (e.g. "May 7, 2025" → "2025-05-07")
- For press release: Focus on artistic content, skip gallery hours/contact info
- For images: ONLY extract images from this gallery's domain - NEVER include artforum.com URLs
- Use empty string "" if field cannot be found (never null)
- Ensure all URLs are complete and valid
- Focus on finding: portrait primary image (iPhone display) + landscape additional images (gallery viewing)

HTML CONTENT:
${html}`;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let rawResponse = '';
    
    try {
      console.log(`📝 Gemini extraction attempt ${attempt}/${MAX_RETRIES}...`);
      
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      rawResponse = text; // Store for error logging
      
      console.log(`📝 Gemini response length: ${text.length} characters`);
      
      // Clean JSON (remove markdown formatting)
      let jsonStr = text.replace(/```json|```/g, '').trim();
      
      // Handle potential JSON parsing issues
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```[\w]*\n?/g, '').trim();
      }
      
      console.log(`🔍 Attempting to parse JSON (${jsonStr.length} chars): ${jsonStr.substring(0, 200)}...`);
      
      let parsed;
      try {
        // Try direct parsing
        parsed = JSON.parse(jsonStr);
        console.log(`✅ JSON parsed successfully on attempt ${attempt}`);
      } catch (jsonError) {
        console.log(`⚠️ JSON parse failed on attempt ${attempt}: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
        
        // If this is the last attempt, try basic cleanup as fallback
        if (attempt === MAX_RETRIES) {
          console.log(`🔧 Last attempt - trying basic JSON cleanup...`);
          try {
            let cleanedJson = jsonStr;
            cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
            cleanedJson = cleanedJson.replace(/[\r\n]+/g, ' '); // Replace newlines with spaces in strings
            cleanedJson = cleanedJson.replace(/\s+/g, ' '); // Normalize whitespace
            
            parsed = JSON.parse(cleanedJson);
            console.log(`✅ JSON parsed after cleanup on final attempt`);
          } catch (cleanupError) {
            console.error(`💥 JSON parsing failed even after cleanup on final attempt:`);
            console.error(`Parse error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
            console.error(`Cleanup error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
            console.error(`Raw response: ${rawResponse.substring(0, 1000)}...`);
            throw new Error(`Gemini extraction failed: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
          }
        } else {
          // For non-final attempts, just throw to trigger retry
          throw jsonError;
        }
      }
      
      // Process and validate images according to mobile-first strategy
      // Include any existing image URL for cleaning (might be Artforum URL from previous extraction)
      const processedImages = processExtractedImages(
        parsed.image_url || '',
        parsed.additional_images || [],
        galleryUrl,
        parsed.image_url // Pass existing image URL for cleaning
      );
      
      // Log image processing results
      const originalImageCount = (parsed.image_url ? 1 : 0) + (parsed.additional_images?.length || 0);
      const processedImageCount = (processedImages.image_url ? 1 : 0) + processedImages.additional_images.length;
      console.log(`📸 Image processing: ${originalImageCount} → ${processedImageCount} images (${processedImages.image_url ? 'primary set' : 'no primary'})`);
      
      // Generate summary if press release exists and no summary was provided
      let generatedSummary = parsed.show_summary || '';
      if (!generatedSummary && parsed.press_release && parsed.press_release.length > 100) {
        try {
          console.log(`📝 Generating summary from ${parsed.press_release.length} char press release...`);
          generatedSummary = await generateShowSummary(
            parsed.press_release, 
            parsed.title, 
            parsed.artists?.[0]
          );
          console.log(`✅ Generated summary: ${generatedSummary.length} characters`);
        } catch (error) {
          console.warn(`⚠️ Summary generation failed: ${error instanceof Error ? error.message : String(error)}`);
          // Continue without summary - not a critical failure
        }
      }
      
             // Phase 2: Extract enhanced metadata
       const enhancedMetadata = await extractEnhancedMetadata(
         parsed.press_release || '',
         parsed.title || '',
         parsed.artists?.[0] || ''
       );

      return {
        ...parsed,
        // Override image fields with processed results
        image_url: processedImages.image_url,
        additional_images: processedImages.additional_images,
        // Add generated summary
        show_summary: generatedSummary,
                 // Add enhanced metadata
         artist_medium: enhancedMetadata.artistMedium,
         // Standard metadata - PHASE 2 FIX: show_url instead of gallery_url
         show_url: galleryUrl, // Gallery exhibition URL discovered during enrichment
         extracted_at: new Date().toISOString(),
         has_been_enriched: true,
         source_url: galleryUrl
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      lastError = error instanceof Error ? error : new Error(message);
      
      // Check for rate limiting specifically - don't retry on rate limits
      if (message.includes('429') || message.includes('Too Many Requests') || message.includes('quota')) {
        throw new Error(`RATE_LIMIT: Gemini API rate limit exceeded. ${message}`);
      }
      
      // Log retry attempts
      if (attempt < MAX_RETRIES) {
        console.log(`🔄 Retrying Gemini extraction (${attempt}/${MAX_RETRIES}) after error: ${message}`);
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } else {
        console.error(`💥 All ${MAX_RETRIES} Gemini extraction attempts failed`);
        
        // Enhanced error logging for JSON parsing issues
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
          console.error('🚨 JSON Parsing Error Details:');
          console.error('Error:', error.message);
          console.error('Raw Gemini response (first 500 chars):', rawResponse.substring(0, 500));
          console.error('Response length:', rawResponse.length);
          console.error('Last 200 chars:', rawResponse.slice(-200));
        }
      }
    }
  }
  
  // If we get here, all retries failed
  throw new Error(`Gemini extraction failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
}

// Export for testing and discovery pipeline
export { processExtractedImages, cleanExistingArtforumImages, extractArthapLinks, validateUrlContent, findAlternativeUrls };