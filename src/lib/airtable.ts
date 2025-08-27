import { supabase } from '@/integrations/supabase/client';

export interface PropertyListing {
  id: string;
  title: string;
  price: number;
  location: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  listingDate: string;
  status: string;
  confidence: number;
  source: string;
  description: string;
  images: string[];
  agent: string;
  features: string[];
  // Original Airtable fields for compatibility
  recordId?: string;
  url?: string;
  sourceHost?: string;
  hash?: string;
  messageId?: string;
  emailSubject?: string;
  from?: string;
  receivedAt?: Date;
  address?: string;
  suburb?: string;
  category?: string;
  beds?: number;
  baths?: number;
  carSpaces?: number;
  landSize?: string;
  lotNumber?: string;
  inspectionStart?: Date;
  inspectionEnd?: Date;
  inspectionNotes?: string;
  agencyName?: string;
  agentName?: string;
  agentPhone?: string;
  floorplans?: string[];
  summary?: string;
  keyEntities?: string;
  rawExtract?: string;
  createdTime?: Date;
  createdAt?: Date;
  webLinks?: string;
  state?: string;
  zipCode?: string;
}

export interface AirtableGetRecordsOptions {
  pageSize?: number;
  offset?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface AirtableResponse {
  records: PropertyListing[];
  offset?: string;
  total: number;
}

class AirtableService {
  async getRecords(options: AirtableGetRecordsOptions = {}): Promise<AirtableResponse> {
    try {
      const { pageSize = 100, offset, sortField = 'ReceivedAt', sortDirection = 'desc' } = options;
      
      // Call the Supabase edge function instead of direct Airtable API
      const { data, error } = await supabase.functions.invoke('airtable-proxy', {
        body: {
          pageSize,
          offset,
          sortField,
          sortDirection,
        },
      });

      if (error) {
        console.error('Error calling airtable-proxy function:', error);
        throw new Error(`Failed to fetch Airtable records: ${error.message}`);
      }

      if (!data) {
        throw new Error('No data returned from airtable-proxy function');
      }

      if (data.error) {
        throw new Error(`Airtable API error: ${data.error}`);
      }

      return {
        records: data.records || [],
        offset: data.offset,
        total: data.total || 0,
      };
    } catch (error) {
      console.error('Failed to fetch Airtable records:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.getRecords({ pageSize: 1 });
      return response.records !== undefined;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  transformRecord(record: any): PropertyListing {
    const fields = record.fields || {};
    
    return {
      id: record.id,
      title: fields.Property_Title || fields.Title || 'Untitled Property',
      price: fields.Price || fields.Asking_Price || 0,
      location: fields.Location || fields.Address || fields.address || 'Location not specified',
      bedrooms: fields.Bedrooms || fields.Bedroom_Count || fields.beds || 0,
      bathrooms: fields.Bathrooms || fields.Bathroom_Count || fields.baths || 0,
      propertyType: fields.Property_Type || fields['Property Type'] || 'Unknown',
      listingDate: fields.Listed_Date || fields.Date_Listed || record.createdTime,
      status: fields.Status || 'Available',
      confidence: fields.Confidence_Score || fields.Confidence || fields.confidence || 85,
      source: fields.Source || fields.Data_Source || 'Airtable',
      description: fields.Description || fields.Property_Description || fields.summary || '',
      images: fields.Images || fields.Property_Images || fields.images || [],
      agent: fields.Agent || fields.Listing_Agent || fields['Agent Name'] || fields.agentName || 'Unknown Agent',
      features: fields.Features || fields.Property_Features || [],
      // Original fields for compatibility
      recordId: fields['Record ID'],
      url: fields['URL'],
      sourceHost: fields['Source Host'],
      hash: fields['Hash'],
      messageId: fields['MessageID'],
      emailSubject: fields['Email Subject'],
      from: fields['From'],
      receivedAt: fields['ReceivedAt'] ? new Date(fields['ReceivedAt']) : undefined,
      address: fields['Address'],
      suburb: fields['Suburb'],
      category: fields['Category'],
      beds: fields['Beds'],
      baths: fields['Baths'],
      carSpaces: fields['Car Spaces'],
      inspectionStart: fields['Inspection Start'] ? new Date(fields['Inspection Start']) : undefined,
      inspectionEnd: fields['Inspection End'] ? new Date(fields['Inspection End']) : undefined,
      inspectionNotes: fields['Inspection Notes'],
      agencyName: fields['Agency Name'],
      agentName: fields['Agent Name'],
      agentPhone: fields['Agent Phone'],
      floorplans: fields['Floorplans'],
      summary: fields['Summary'],
      keyEntities: fields['Key Entities'],
      rawExtract: fields['Raw Extract'],
      createdTime: record.createdTime ? new Date(record.createdTime) : undefined,
      createdAt: fields['Created At'] ? new Date(fields['Created At']) : undefined,
      state: fields['State'],
      zipCode: fields['Zipcode'] || fields['Zip Code'] || fields['Post Code'] || fields['Postcode'],
    };
  }
}

export const airtableService = new AirtableService();