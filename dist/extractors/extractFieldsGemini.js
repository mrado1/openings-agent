"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractShowFields = extractShowFields;
exports.processExtractedImages = processExtractedImages;
exports.cleanExistingArtforumImages = cleanExistingArtforumImages;
const generative_ai_1 = require("@google/generative-ai");
/**
 * Clean any existing Artforum URLs from show data
 */
function cleanExistingArtforumImages(existingImageUrl) {
    if (!existingImageUrl || existingImageUrl.includes('artforum.com')) {
        console.log(`🧹 Cleaned existing Artforum image URL: ${existingImageUrl || 'none'}`);
        return '';
    }
    return existingImageUrl;
}
/**
 * Process and validate extracted images according to mobile-first strategy
 */
function processExtractedImages(primaryImage, additionalImages, galleryUrl, existingImageUrl) {
    const galleryDomain = new URL(galleryUrl).hostname;
    // Clean any existing Artforum image and include in processing
    const cleanedExistingImage = cleanExistingArtforumImages(existingImageUrl);
    // Combine all images for processing (prioritize new extractions over existing)
    const allImages = [primaryImage, ...additionalImages, cleanedExistingImage].filter(Boolean);
    // Filter out Artforum URLs and invalid images, converting relative URLs to absolute
    const validImages = allImages.map(imageUrl => {
        if (!imageUrl || typeof imageUrl !== 'string')
            return null;
        try {
            // Handle relative URLs by converting to absolute
            let fullImageUrl = imageUrl;
            if (imageUrl.startsWith('/')) {
                const galleryOrigin = new URL(galleryUrl).origin;
                fullImageUrl = galleryOrigin + imageUrl;
            }
            else if (imageUrl.startsWith('./') || (!imageUrl.includes('://') && !imageUrl.startsWith('http'))) {
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
            const hasValidExtension = validExtensions.some(ext => fullImageUrl.toLowerCase().includes(ext));
            // Avoid social media, logos, and navigation elements
            const isInvalidImage = [
                'logo', 'icon', 'favicon', 'nav', 'menu', 'footer', 'header',
                'facebook', 'instagram', 'twitter', 'social', 'share'
            ].some(term => fullImageUrl.toLowerCase().includes(term));
            if (hasValidExtension && !isInvalidImage) {
                return fullImageUrl;
            }
            return null;
        }
        catch (error) {
            console.log(`🚫 Invalid image URL: ${imageUrl}`);
            return null;
        }
    }).filter((url) => url !== null);
    if (validImages.length === 0) {
        console.log(`⚠️ No valid gallery images found, returning empty image fields`);
        console.log(`🚫 Rejected ${allImages.length} images (likely Artforum URLs or invalid formats)`);
        return { image_url: '', additional_images: [] };
    }
    // Score images for mobile-friendliness (prefer 16:9-ish aspect ratios)
    const scoredImages = validImages.map(imageUrl => {
        let score = 0;
        const url = new URL(imageUrl);
        // Prefer images from same gallery domain
        if (url.hostname.includes(galleryDomain.replace('www.', ''))) {
            score += 10;
        }
        // Prefer high-resolution indicators
        if (imageUrl.match(/\d{3,4}x\d{3,4}/)) { // Has resolution in URL like 1200x800
            const match = imageUrl.match(/(\d{3,4})x(\d{3,4})/);
            if (match) {
                const width = parseInt(match[1]);
                const height = parseInt(match[2]);
                const aspectRatio = width / height;
                // Prefer 16:9 (1.78) or similar mobile-friendly ratios (1.5-2.0)
                if (aspectRatio >= 1.5 && aspectRatio <= 2.0) {
                    score += 8;
                }
                // Prefer larger images
                if (width >= 800)
                    score += 5;
                if (width >= 1200)
                    score += 3;
            }
        }
        // Prefer certain file formats
        if (imageUrl.includes('.webp'))
            score += 3;
        if (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg'))
            score += 2;
        if (imageUrl.includes('.png'))
            score += 1;
        // Prefer exhibition/artwork related paths
        const exhibitionTerms = ['exhibition', 'show', 'artwork', 'installation', 'gallery', 'view'];
        if (exhibitionTerms.some(term => imageUrl.toLowerCase().includes(term))) {
            score += 5;
        }
        return { url: imageUrl, score };
    });
    // Sort by score (highest first)
    scoredImages.sort((a, b) => b.score - a.score);
    console.log(`🖼️ Processed ${validImages.length} valid images, top score: ${scoredImages[0]?.score || 0}`);
    // Return best image as primary, rest as additional (limit to 5 additional for mobile performance)
    const primaryImageUrl = scoredImages[0].url;
    const additionalImageUrls = scoredImages.slice(1, 6).map(img => img.url);
    console.log(`✅ Selected primary image: ${primaryImageUrl}`);
    console.log(`✅ Selected ${additionalImageUrls.length} additional images`);
    return {
        image_url: primaryImageUrl,
        additional_images: additionalImageUrls
    };
}
async function extractShowFields(html, galleryUrl) {
    // Initialize genAI after environment is loaded
    const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `You are an expert art gallery website parser. Extract exhibition information from this HTML with high precision.

CRITICAL INSTRUCTIONS:
1. DATES: Look for exhibition dates, opening/closing dates, duration. Common formats: "May 7 - August 15, 2025", "Through August 15", "On view until...", "May 7, 2025 - Aug 15, 2025"
2. PRESS RELEASE: Find the main exhibition description/statement, NOT gallery navigation or contact info. Look for artist statement, curatorial text, or exhibition overview.
3. IMAGES: Extract high-resolution artwork images from THIS GALLERY WEBSITE ONLY
   - NEVER use artforum.com images
   - Prefer images with mobile-friendly aspect ratios (16:9 or similar rectangular)
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
- Focus on finding high-quality exhibition images that work well on mobile devices

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
        const parsed = JSON.parse(jsonStr);
        // Process and validate images according to mobile-first strategy
        // Include any existing image URL for cleaning (might be Artforum URL from previous extraction)
        const processedImages = processExtractedImages(parsed.image_url || '', parsed.additional_images || [], galleryUrl, parsed.image_url // Pass existing image URL for cleaning
        );
        // Log image processing results
        const originalImageCount = (parsed.image_url ? 1 : 0) + (parsed.additional_images?.length || 0);
        const processedImageCount = (processedImages.image_url ? 1 : 0) + processedImages.additional_images.length;
        console.log(`📸 Image processing: ${originalImageCount} → ${processedImageCount} images (${processedImages.image_url ? 'primary set' : 'no primary'})`);
        return {
            ...parsed,
            // Override image fields with processed results
            image_url: processedImages.image_url,
            additional_images: processedImages.additional_images,
            // Standard metadata
            gallery_url: galleryUrl,
            extracted_at: new Date().toISOString(),
            has_been_enriched: true,
            source_url: galleryUrl
        };
    }
    catch (error) {
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
