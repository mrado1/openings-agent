import { ShowData } from '../types/schemas';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  quality_score: number;
}

export function validateExtractionResult(data: Partial<ShowData>): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    quality_score: 0
  };

  let totalFields = 0;
  let validFields = 0;

  // Validate title
  totalFields++;
  if (!data.title || data.title.trim() === '') {
    result.errors.push('Title is missing or empty');
  } else if (data.title.length < 3) {
    result.warnings.push('Title seems too short');
    validFields += 0.5;
  } else {
    validFields++;
  }

  // Validate artists
  totalFields++;
  if (!data.artists || !Array.isArray(data.artists) || data.artists.length === 0) {
    result.errors.push('Artists array is missing or empty');
  } else if (data.artists.some(artist => !artist || artist.trim() === '')) {
    result.warnings.push('Some artist names appear to be empty');
    validFields += 0.7;
  } else {
    validFields++;
  }

  // Validate dates
  totalFields += 2;
  const startDateValid = validateDate(data.start_date, 'start_date', result);
  const endDateValid = validateDate(data.end_date, 'end_date', result);
  
  if (startDateValid) validFields++;
  if (endDateValid) validFields++;

  // Check date logic
  if (startDateValid && endDateValid && data.start_date && data.end_date) {
    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);
    
    if (startDate >= endDate) {
      result.warnings.push('Start date is not before end date');
    }
    
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (duration > 365) {
      result.warnings.push('Exhibition duration seems unusually long (>1 year)');
    }
  }

  // Validate press release
  totalFields++;
  if (!data.press_release || data.press_release.trim() === '') {
    result.errors.push('Press release is missing or empty');
  } else {
    const quality = validatePressReleaseQuality(data.press_release);
    if (quality.score < 0.5) {
      result.warnings.push('Press release quality seems low: ' + quality.reason);
      validFields += quality.score;
    } else {
      validFields++;
    }
  }

  // Validate image URLs
  totalFields++;
  if (!data.image_url || data.image_url.trim() === '') {
    result.errors.push('Primary image URL is missing');
  } else if (!isValidUrl(data.image_url)) {
    result.errors.push('Primary image URL appears invalid');
  } else {
    validFields++;
  }

  // Validate additional images (optional, but check quality if present)
  if (data.additional_images && data.additional_images.length > 0) {
    const invalidImages = data.additional_images.filter(url => !isValidUrl(url));
    if (invalidImages.length > 0) {
      result.warnings.push(`${invalidImages.length} additional image URLs appear invalid`);
    }
  }

  // Calculate quality score
  result.quality_score = Math.round((validFields / totalFields) * 100);

  // Determine overall validity
  result.isValid = result.errors.length === 0 && result.quality_score >= 60;

  return result;
}

function validateDate(dateStr: string | undefined, fieldName: string, result: ValidationResult): boolean {
  if (!dateStr || dateStr.trim() === '') {
    result.errors.push(`${fieldName} is missing or empty`);
    return false;
  }

  // Check ISO format (YYYY-MM-DD)
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateStr)) {
    result.errors.push(`${fieldName} is not in ISO format (YYYY-MM-DD): ${dateStr}`);
    return false;
  }

  // Check if date is valid
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    result.errors.push(`${fieldName} is not a valid date: ${dateStr}`);
    return false;
  }

  // Check if date is reasonable (not too far in past/future)
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const twoYearsFromNow = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

  if (date < oneYearAgo) {
    result.warnings.push(`${fieldName} is more than 1 year in the past: ${dateStr}`);
  } else if (date > twoYearsFromNow) {
    result.warnings.push(`${fieldName} is more than 2 years in the future: ${dateStr}`);
  }

  return true;
}

function validatePressReleaseQuality(text: string): { score: number; reason: string } {
  if (text.length < 50) {
    return { score: 0.2, reason: 'Too short (less than 50 characters)' };
  }

  if (text.length < 100) {
    return { score: 0.5, reason: 'Short content (less than 100 characters)' };
  }

  // Check for navigation/boilerplate content
  const boilerplateTerms = [
    'gallery hours', 'opening hours', 'contact us', 'directions', 'subscribe',
    'newsletter', 'follow us', 'social media', 'copyright', 'all rights reserved',
    'privacy policy', 'terms of service', 'gallery info', 'about the gallery'
  ];

  const lowercaseText = text.toLowerCase();
  const boilerplateCount = boilerplateTerms.filter(term => lowercaseText.includes(term)).length;

  if (boilerplateCount > 2) {
    return { score: 0.3, reason: 'Contains too much navigation/boilerplate content' };
  }

  // Check for artistic content indicators
  const artisticTerms = [
    'exhibition', 'artwork', 'sculpture', 'painting', 'installation', 'artist',
    'gallery', 'solo show', 'group show', 'on view', 'presents', 'features',
    'explores', 'work', 'piece', 'medium', 'material', 'concept', 'theme'
  ];

  const artisticCount = artisticTerms.filter(term => lowercaseText.includes(term)).length;

  if (artisticCount >= 3) {
    return { score: 1.0, reason: 'Good artistic content' };
  } else if (artisticCount >= 1) {
    return { score: 0.7, reason: 'Some artistic content' };
  } else {
    return { score: 0.4, reason: 'Limited artistic content indicators' };
  }
}

function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

export function formatValidationReport(validation: ValidationResult): string {
  let report = `\n📊 VALIDATION REPORT\n`;
  report += `Quality Score: ${validation.quality_score}% ${validation.isValid ? '✅' : '❌'}\n\n`;

  if (validation.errors.length > 0) {
    report += `🚨 ERRORS (${validation.errors.length}):\n`;
    validation.errors.forEach(error => {
      report += `  • ${error}\n`;
    });
    report += '\n';
  }

  if (validation.warnings.length > 0) {
    report += `⚠️  WARNINGS (${validation.warnings.length}):\n`;
    validation.warnings.forEach(warning => {
      report += `  • ${warning}\n`;
    });
    report += '\n';
  }

  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    report += `✅ All validations passed!\n\n`;
  }

  return report;
} 