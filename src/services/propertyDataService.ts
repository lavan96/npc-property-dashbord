import { airtableService, PropertyListing } from '@/lib/airtable';

export interface PropertyDataOptions {
  maxRecords?: number;
  includeDebugInfo?: boolean;
}

export interface PropertyDataResult {
  listings: PropertyListing[];
  debugInfo: {
    totalFetched: number;
    duplicatesRemoved: number;
    fetchTime: number;
    sources: Record<string, number>;
    dataQuality: {
      withPrice: number;
      withLocation: number;
      withBedrooms: number;
      withPropertyType: number;
    };
  };
}

/**
 * Unified property data service that ensures consistent data fetching,
 * processing, and deduplication across dashboard and reports
 */
class PropertyDataService {
  private cache: {
    data: PropertyListing[] | null;
    timestamp: number;
    ttl: number; // 5 minutes
  } = {
    data: null,
    timestamp: 0,
    ttl: 5 * 60 * 1000
  };

  /**
   * Fetch all property listings with consistent processing
   */
  async fetchAllListings(options: PropertyDataOptions = {}): Promise<PropertyDataResult> {
    const startTime = Date.now();
    const { maxRecords, includeDebugInfo = false } = options;

    // Check cache first
    const now = Date.now();
    if (this.cache.data && (now - this.cache.timestamp) < this.cache.ttl) {
      console.log('Using cached property data');
      return this.buildResult(this.cache.data, startTime, includeDebugInfo);
    }

    try {
      let allRecords: PropertyListing[] = [];
      let offset: string | undefined;
      let pageCount = 0;
      const maxPages = maxRecords ? Math.ceil(maxRecords / 100) : Infinity;

      console.log('Fetching property data from Airtable...');

      // Fetch all data consistently
      do {
        const response = await airtableService.getRecords({
          pageSize: 100,
          offset,
          sortField: 'ReceivedAt',
          sortDirection: 'desc'
        });

        allRecords = [...allRecords, ...response.records];
        offset = response.offset;
        pageCount++;

        console.log(`Fetched page ${pageCount}, total records: ${allRecords.length}`);

        // Break if we've reached max records limit
        if (maxRecords && allRecords.length >= maxRecords) {
          allRecords = allRecords.slice(0, maxRecords);
          break;
        }

        // Break if we've reached max pages (safety check)
        if (pageCount >= maxPages) {
          break;
        }
      } while (offset);

      console.log(`Raw data fetched: ${allRecords.length} records`);

      // Apply comprehensive deduplication and data cleaning
      const processedListings = this.processAndDeduplicateListings(allRecords);

      // Update cache
      this.cache = {
        data: processedListings,
        timestamp: now,
        ttl: this.cache.ttl
      };

      console.log(`Processed data: ${processedListings.length} unique records`);

      return this.buildResult(processedListings, startTime, includeDebugInfo);

    } catch (error) {
      console.error('Error fetching property data:', error);
      throw error;
    }
  }

  /**
   * Clear the cache to force fresh data fetch
   */
  clearCache(): void {
    this.cache = {
      data: null,
      timestamp: 0,
      ttl: this.cache.ttl
    };
  }

  /**
   * Comprehensive listing processing and deduplication
   */
  private processAndDeduplicateListings(rawListings: PropertyListing[]): PropertyListing[] {
    console.log('Processing and deduplicating listings...');

    // First, standardize all listings
    const standardized = rawListings.map(listing => this.standardizeListing(listing));

    // Group potential duplicates by key characteristics
    const uniqueListings = new Map<string, PropertyListing>();
    const duplicateTracker = new Map<string, number>();

    for (const listing of standardized) {
      // Create a composite key for deduplication
      const key = this.createDeduplicationKey(listing);

      if (uniqueListings.has(key)) {
        // Found duplicate - keep the one with better data quality
        const existing = uniqueListings.get(key)!;
        const current = listing;

        const existingScore = this.calculateDataQualityScore(existing);
        const currentScore = this.calculateDataQualityScore(current);

        if (currentScore > existingScore) {
          uniqueListings.set(key, current);
        }

        duplicateTracker.set(key, (duplicateTracker.get(key) || 1) + 1);
      } else {
        uniqueListings.set(key, listing);
      }
    }

    const finalListings = Array.from(uniqueListings.values());

    console.log(`Deduplication complete: ${rawListings.length} -> ${finalListings.length} listings`);
    console.log(`Duplicates found: ${duplicateTracker.size} groups with ${Array.from(duplicateTracker.values()).reduce((sum, count) => sum + count - 1, 0)} duplicates`);

    return finalListings;
  }

  /**
   * Standardize listing data for consistent processing
   */
  private standardizeListing(listing: PropertyListing): PropertyListing {
    return {
      ...listing,
      // Standardize property type
      propertyType: this.standardizePropertyType(listing.propertyType),
      
      // Standardize suburb/location
      suburb: this.standardizeSuburb(listing.suburb || listing.location),
      
      // Standardize price
      price: this.standardizePrice(listing.price),
      
      // Standardize bed/bath counts
      beds: this.standardizeBedBath(listing.beds || listing.bedrooms),
      baths: this.standardizeBedBath(listing.baths || listing.bathrooms),
      
      // Standardize dates
      receivedAt: this.standardizeDate(listing.receivedAt || listing.createdAt || listing.createdTime),
      listingDate: this.standardizeDate(listing.listingDate),
      
      // Add data quality metrics
      dataQuality: this.calculateDataQualityScore(listing),
      isValidPrice: this.isValidPrice(listing.price),
      isValidLocation: this.isValidLocation(listing.address || listing.location),
      completenessScore: this.calculateCompletenessScore(listing)
    };
  }

  /**
   * Create a unique key for deduplication based on core characteristics
   */
  private createDeduplicationKey(listing: PropertyListing): string {
    const address = this.normalizeAddress(listing.address || listing.location || '');
    const price = listing.price || 0;
    const beds = listing.beds || listing.bedrooms || 0;
    const baths = listing.baths || listing.bathrooms || 0;
    const suburb = this.standardizeSuburb(listing.suburb || listing.location);

    // Create a composite key that captures the essence of the listing
    return `${address}|${suburb}|${price}|${beds}|${baths}`;
  }

  /**
   * Calculate data quality score for a listing
   */
  private calculateDataQualityScore(listing: PropertyListing): number {
    let score = 0;
    const weights = {
      price: 25,
      address: 20,
      bedrooms: 15,
      bathrooms: 10,
      propertyType: 10,
      suburb: 10,
      agent: 5,
      description: 5
    };

    if (this.isValidPrice(listing.price)) score += weights.price;
    if (this.isValidLocation(listing.address || listing.location)) score += weights.address;
    if ((listing.beds || listing.bedrooms) && (listing.beds || listing.bedrooms)! > 0) score += weights.bedrooms;
    if ((listing.baths || listing.bathrooms) && (listing.baths || listing.bathrooms)! > 0) score += weights.bathrooms;
    if (listing.propertyType && listing.propertyType !== 'Unknown') score += weights.propertyType;
    if (listing.suburb && listing.suburb !== 'Unknown') score += weights.suburb;
    if (listing.agent || listing.agentName) score += weights.agent;
    if (listing.description && listing.description.length > 20) score += weights.description;

    return score;
  }

  /**
   * Standardize property types
   */
  private standardizePropertyType(type?: string): string {
    if (!type) return 'Unknown';
    
    const normalized = type.toLowerCase().trim();
    
    if (normalized.includes('house') || normalized.includes('home')) return 'House';
    if (normalized.includes('apartment') || normalized.includes('unit')) return 'Apartment';
    if (normalized.includes('townhouse') || normalized.includes('town house')) return 'Townhouse';
    if (normalized.includes('villa')) return 'Villa';
    if (normalized.includes('duplex')) return 'Duplex';
    if (normalized.includes('land') || normalized.includes('lot')) return 'Land';
    
    return type; // Return original if no match
  }

  /**
   * Standardize suburb names
   */
  private standardizeSuburb(suburb?: string): string {
    if (!suburb) return 'Unknown';
    
    return suburb
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Standardize price values
   */
  private standardizePrice(price?: number | null): number | null {
    if (!price || price <= 0 || price > 50000000) return null; // Invalid prices
    return Math.round(price);
  }

  /**
   * Standardize bed/bath counts
   */
  private standardizeBedBath(count?: number | null): number | null {
    if (!count || count < 0 || count > 20) return null; // Invalid counts
    return Math.round(count);
  }

  /**
   * Standardize dates
   */
  private standardizeDate(date?: Date | string | null): string | null {
    if (!date) return null;
    
    try {
      const validDate = date instanceof Date ? date : new Date(date);
      if (isNaN(validDate.getTime())) return null;
      return validDate.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Normalize address for comparison
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[^\\w\\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if price is valid
   */
  private isValidPrice(price?: number | null): boolean {
    return !!(price && price > 0 && price <= 50000000);
  }

  /**
   * Check if location is valid
   */
  private isValidLocation(location?: string): boolean {
    return !!(location && location.trim().length > 3);
  }

  /**
   * Calculate completeness score
   */
  private calculateCompletenessScore(listing: PropertyListing): number {
    const fields = [
      'price', 'address', 'beds', 'baths', 'propertyType', 'suburb',
      'agent', 'description', 'images', 'source'
    ];
    
    let filledFields = 0;
    fields.forEach(field => {
      const value = (listing as any)[field];
      if (value !== null && value !== undefined && value !== '' && 
          !(Array.isArray(value) && value.length === 0)) {
        filledFields++;
      }
    });
    
    return (filledFields / fields.length) * 100;
  }

  /**
   * Build the final result with debug information
   */
  private buildResult(listings: PropertyListing[], startTime: number, includeDebugInfo: boolean): PropertyDataResult {
    const debugInfo = includeDebugInfo ? {
      totalFetched: listings.length,
      duplicatesRemoved: 0, // Will be calculated during processing
      fetchTime: Date.now() - startTime,
      sources: this.calculateSourceDistribution(listings),
      dataQuality: {
        withPrice: listings.filter(l => this.isValidPrice(l.price)).length,
        withLocation: listings.filter(l => this.isValidLocation(l.address || l.location)).length,
        withBedrooms: listings.filter(l => (l.beds || l.bedrooms) && (l.beds || l.bedrooms)! > 0).length,
        withPropertyType: listings.filter(l => l.propertyType && l.propertyType !== 'Unknown').length,
      }
    } : {
      totalFetched: 0,
      duplicatesRemoved: 0,
      fetchTime: 0,
      sources: {},
      dataQuality: { withPrice: 0, withLocation: 0, withBedrooms: 0, withPropertyType: 0 }
    };

    return {
      listings,
      debugInfo
    };
  }

  /**
   * Calculate source distribution for debugging
   */
  private calculateSourceDistribution(listings: PropertyListing[]): Record<string, number> {
    return listings.reduce((acc, listing) => {
      const source = listing.source || 'Unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

export const propertyDataService = new PropertyDataService();
