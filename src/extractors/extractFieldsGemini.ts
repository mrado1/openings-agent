import { GoogleGenerativeAI } from '@google/generative-ai';
import { ShowData } from '../types/schemas';
import { generateShowSummary } from '../services/summaryGenerationService';

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

export async function extractShowFields(html: string, galleryUrl: string): Promise<Partial<ShowData>> {
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

  let rawResponse = '';
  try {
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
      // First try - direct parsing
      parsed = JSON.parse(jsonStr);
    } catch (firstError) {
      console.log(`⚠️ Initial JSON parse failed, trying cleanup: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
      
      try {
        // Second try - basic cleanup
        let cleanedJson = jsonStr;
        
        // Only fix obvious issues without aggressive regex
        cleanedJson = cleanedJson.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
        cleanedJson = cleanedJson.replace(/[\r\n]+/g, ' '); // Replace newlines with spaces in strings
        cleanedJson = cleanedJson.replace(/\s+/g, ' '); // Normalize whitespace
        
        parsed = JSON.parse(cleanedJson);
        console.log(`✅ JSON parsed after basic cleanup`);
      } catch (secondError) {
        console.error(`💥 JSON parsing failed even after cleanup:`);
        console.error(`First error: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
        console.error(`Second error: ${secondError instanceof Error ? secondError.message : String(secondError)}`);
        console.error(`Raw response: ${rawResponse.substring(0, 1000)}...`);
        throw new Error(`Gemini extraction failed: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
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
    
    return {
      ...parsed,
      // Override image fields with processed results
      image_url: processedImages.image_url,
      additional_images: processedImages.additional_images,
      // Add generated summary
      show_summary: generatedSummary,
      // Standard metadata
      gallery_url: galleryUrl,
      extracted_at: new Date().toISOString(),
      has_been_enriched: true,
      source_url: galleryUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for rate limiting specifically
    if (message.includes('429') || message.includes('Too Many Requests') || message.includes('quota')) {
      throw new Error(`RATE_LIMIT: Gemini API rate limit exceeded. ${message}`);
    }
    
    // Enhanced error logging for JSON parsing issues
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.error('🚨 JSON Parsing Error Details:');
      console.error('Error:', error.message);
      console.error('Raw Gemini response (first 500 chars):', rawResponse.substring(0, 500));
      console.error('Response length:', rawResponse.length);
      console.error('Last 200 chars:', rawResponse.slice(-200));
    }
    
    throw new Error(`Gemini extraction failed: ${message}`);
  }
}

// Export for testing
export { processExtractedImages, cleanExistingArtforumImages };